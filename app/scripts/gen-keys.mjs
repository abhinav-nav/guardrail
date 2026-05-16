#!/usr/bin/env node
import { Wallet } from "ethers";
import fs from "node:fs";
import path from "node:path";

const principal = Wallet.createRandom();
const agent = Wallet.createRandom();
const alice = Wallet.createRandom();
const deployer = Wallet.createRandom();

const envPath = path.resolve(process.cwd(), ".env.local");

const env = `# auto-generated demo keys — DO NOT REUSE
GEMINI_API_KEY=${process.env.GEMINI_API_KEY ?? "REPLACE_ME"}

ZG_RPC_URL=https://evmrpc-testnet.0g.ai
ZG_CHAIN_ID=16601
ZG_EXPLORER=https://chainscan-galileo.0g.ai
ZG_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai

DEPLOYER_PK=${deployer.privateKey}
PRINCIPAL_PK=${principal.privateKey}
AGENT_PK=${agent.privateKey}
ALICE_ADDRESS=${alice.address}

SPEND_POLICY_ADDRESS=
`;

fs.writeFileSync(envPath, env);

console.log("Wrote", envPath);
console.log("");
console.log("FUND THESE ADDRESSES ON 0G MAINNET:");
console.log("  DEPLOYER  ~0.02 0G:", deployer.address);
console.log("  PRINCIPAL ~0.1  0G:", principal.address);
console.log("  AGENT     ~0.02 0G:", agent.address);
console.log("  (alice — recipient, no funding):", alice.address);
