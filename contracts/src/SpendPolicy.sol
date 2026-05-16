// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GuardRail SpendPolicy
/// @notice On-chain circuit breaker for AI agent wallets.
/// Holds funds on behalf of a "principal" (human owner). An agent registered
/// to that principal can only move funds through executeTx(), which enforces
/// per-tx caps, rolling daily caps, recipient allowlists, and cooldowns.
/// Every decision (approved or blocked) is emitted as an event so the agent's
/// behavior is fully auditable on the 0G Chain explorer.
contract SpendPolicy {
    // --- Types ---

    struct Policy {
        uint128 maxPerTx;        // wei
        uint128 maxPerDay;       // wei
        uint64  cooldownSeconds; // min seconds between txs
        bool    allowlistOnly;   // if true, recipient must be in allowlist
        bool    exists;
    }

    struct DailySpend {
        uint64  windowStart; // unix seconds, start of current 24h window
        uint192 spent;       // wei spent in this window
    }

    // --- State ---

    /// principal => Policy
    mapping(address => Policy) public policyOf;

    /// principal => agent address => is registered
    mapping(address => mapping(address => bool)) public isAgent;

    /// principal => recipient => allowed
    mapping(address => mapping(address => bool)) public isAllowed;

    /// principal => DailySpend
    mapping(address => DailySpend) public dailyOf;

    /// principal => last tx timestamp (for cooldown)
    mapping(address => uint64) public lastTxAt;

    /// principal => deposited balance (wei)
    mapping(address => uint256) public balanceOf;

    /// principal => Agent ID metadata root (e.g. 0G Storage root hash for memory/policy doc)
    mapping(address => bytes32) public agentIdRoot;

    // --- Events ---

    event PolicySet(address indexed principal, uint128 maxPerTx, uint128 maxPerDay, uint64 cooldownSeconds, bool allowlistOnly);
    event AgentRegistered(address indexed principal, address indexed agent, bytes32 agentIdRoot);
    event AgentRevoked(address indexed principal, address indexed agent);
    event AllowlistUpdated(address indexed principal, address indexed recipient, bool allowed);
    event Deposited(address indexed principal, uint256 amount);
    event Withdrawn(address indexed principal, uint256 amount);

    event TxApproved(
        address indexed principal,
        address indexed agent,
        address indexed to,
        uint256 amount,
        bytes32 memoryRoot,
        string  reason
    );

    event TxBlocked(
        address indexed principal,
        address indexed agent,
        address indexed to,
        uint256 amount,
        bytes32 memoryRoot,
        string  reason
    );

    // --- Errors ---

    error NotAgent();
    error NoPolicy();
    error PerTxCapExceeded();
    error DailyCapExceeded();
    error CooldownActive();
    error RecipientNotAllowed();
    error InsufficientBalance();
    error TransferFailed();

    // --- Principal: setup ---

    function setPolicy(
        uint128 maxPerTx,
        uint128 maxPerDay,
        uint64 cooldownSeconds,
        bool allowlistOnly
    ) external {
        policyOf[msg.sender] = Policy({
            maxPerTx: maxPerTx,
            maxPerDay: maxPerDay,
            cooldownSeconds: cooldownSeconds,
            allowlistOnly: allowlistOnly,
            exists: true
        });
        emit PolicySet(msg.sender, maxPerTx, maxPerDay, cooldownSeconds, allowlistOnly);
    }

    function registerAgent(address agent, bytes32 idRoot) external {
        isAgent[msg.sender][agent] = true;
        agentIdRoot[msg.sender] = idRoot;
        emit AgentRegistered(msg.sender, agent, idRoot);
    }

    function revokeAgent(address agent) external {
        isAgent[msg.sender][agent] = false;
        emit AgentRevoked(msg.sender, agent);
    }

    function setAllowlist(address recipient, bool allowed) external {
        isAllowed[msg.sender][recipient] = allowed;
        emit AllowlistUpdated(msg.sender, recipient, allowed);
    }

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // --- Agent: execute ---

    /// @notice Agent requests a transfer on behalf of principal.
    /// Reverts (and emits TxBlocked) if any policy rule is violated.
    /// memoryRoot is the 0G Storage / DA commitment for the reasoning trace
    /// behind this decision, anchoring agent state to the on-chain audit log.
    function executeTx(
        address principal,
        address payable to,
        uint256 amount,
        bytes32 memoryRoot,
        string calldata reason
    ) external {
        if (!isAgent[principal][msg.sender]) revert NotAgent();

        Policy memory p = policyOf[principal];
        if (!p.exists) revert NoPolicy();

        // 1. per-tx cap
        if (amount > p.maxPerTx) {
            emit TxBlocked(principal, msg.sender, to, amount, memoryRoot, "PER_TX_CAP");
            revert PerTxCapExceeded();
        }

        // 2. allowlist
        if (p.allowlistOnly && !isAllowed[principal][to]) {
            emit TxBlocked(principal, msg.sender, to, amount, memoryRoot, "NOT_ALLOWLISTED");
            revert RecipientNotAllowed();
        }

        // 3. cooldown
        uint64 nowTs = uint64(block.timestamp);
        if (p.cooldownSeconds > 0 && lastTxAt[principal] != 0 && nowTs - lastTxAt[principal] < p.cooldownSeconds) {
            emit TxBlocked(principal, msg.sender, to, amount, memoryRoot, "COOLDOWN");
            revert CooldownActive();
        }

        // 4. rolling daily cap
        DailySpend memory d = dailyOf[principal];
        if (nowTs - d.windowStart >= 1 days) {
            d.windowStart = nowTs;
            d.spent = 0;
        }
        if (uint256(d.spent) + amount > p.maxPerDay) {
            emit TxBlocked(principal, msg.sender, to, amount, memoryRoot, "DAILY_CAP");
            revert DailyCapExceeded();
        }

        // 5. balance
        if (balanceOf[principal] < amount) {
            emit TxBlocked(principal, msg.sender, to, amount, memoryRoot, "INSUFFICIENT_BALANCE");
            revert InsufficientBalance();
        }

        // Update accounting
        d.spent = uint192(uint256(d.spent) + amount);
        dailyOf[principal] = d;
        lastTxAt[principal] = nowTs;
        balanceOf[principal] -= amount;

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit TxApproved(principal, msg.sender, to, amount, memoryRoot, reason);
    }

    /// @notice Agent or principal anchors an updated memory/policy root to chain.
    /// memoryRoot is typically a 0G Storage Merkle root or DA commitment of
    /// the agent's reasoning trace / memory blob.
    function anchorMemoryRoot(address principal, bytes32 memoryRoot) external {
        if (msg.sender != principal && !isAgent[principal][msg.sender]) revert NotAgent();
        agentIdRoot[principal] = memoryRoot;
        emit AgentRegistered(principal, msg.sender, memoryRoot);
    }

    receive() external payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }
}
