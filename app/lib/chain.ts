import { ethers } from "ethers";

export const ZG_RPC = process.env.ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
export const ZG_CHAIN_ID = Number(process.env.ZG_CHAIN_ID ?? 16602);
export const ZG_EXPLORER = process.env.ZG_EXPLORER ?? "https://chainscan-galileo.0g.ai";
export const SPEND_POLICY_ADDRESS = (process.env.SPEND_POLICY_ADDRESS ?? "") as `0x${string}`;

export const provider = new ethers.JsonRpcProvider(ZG_RPC, ZG_CHAIN_ID, {
  staticNetwork: true,
});

export function txUrl(hash: string) {
  return `${ZG_EXPLORER}/tx/${hash}`;
}
export function addrUrl(addr: string) {
  return `${ZG_EXPLORER}/address/${addr}`;
}

export function principalWallet() {
  const pk = process.env.PRINCIPAL_PK;
  if (!pk) throw new Error("PRINCIPAL_PK not set");
  return new ethers.Wallet(pk, provider);
}

export function agentWallet() {
  const pk = process.env.AGENT_PK;
  if (!pk) throw new Error("AGENT_PK not set");
  return new ethers.Wallet(pk, provider);
}

export const SPEND_POLICY_ABI = [
  "function setPolicy(uint128 maxPerTx, uint128 maxPerDay, uint64 cooldownSeconds, bool allowlistOnly) external",
  "function registerAgent(address agent, bytes32 idRoot) external",
  "function setAllowlist(address recipient, bool allowed) external",
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
  "function executeTx(address principal, address to, uint256 amount, bytes32 memoryRoot, string reason) external",
  "function anchorMemoryRoot(address principal, bytes32 memoryRoot) external",
  "function balanceOf(address) external view returns (uint256)",
  "function policyOf(address) external view returns (uint128 maxPerTx, uint128 maxPerDay, uint64 cooldownSeconds, bool allowlistOnly, bool exists)",
  "function isAgent(address, address) external view returns (bool)",
  "function isAllowed(address, address) external view returns (bool)",
  "function agentIdRoot(address) external view returns (bytes32)",
  "event TxApproved(address indexed principal, address indexed agent, address indexed to, uint256 amount, bytes32 memoryRoot, string reason)",
  "event TxBlocked(address indexed principal, address indexed agent, address indexed to, uint256 amount, bytes32 memoryRoot, string reason)",
  "event PolicySet(address indexed principal, uint128 maxPerTx, uint128 maxPerDay, uint64 cooldownSeconds, bool allowlistOnly)",
  "event AgentRegistered(address indexed principal, address indexed agent, bytes32 agentIdRoot)",
  "event Deposited(address indexed principal, uint256 amount)",
  "error NotAgent()",
  "error NoPolicy()",
  "error PerTxCapExceeded()",
  "error DailyCapExceeded()",
  "error CooldownActive()",
  "error RecipientNotAllowed()",
  "error InsufficientBalance()",
  "error TransferFailed()",
];

export function spendPolicyContract(signerOrProvider: ethers.Signer | ethers.Provider = provider) {
  if (!SPEND_POLICY_ADDRESS) throw new Error("SPEND_POLICY_ADDRESS not set");
  return new ethers.Contract(SPEND_POLICY_ADDRESS, SPEND_POLICY_ABI, signerOrProvider);
}
