#!/usr/bin/env node
// One-shot: deploy SpendPolicy to 0G Galileo testnet, write address to
// .env.local, then call /api/setup to register agent + policy + deposit.
//
// Prereqs:
//   • app/.env.local has DEPLOYER_PK, PRINCIPAL_PK, AGENT_PK funded with ≥0.05 0G each
//   • foundry installed (forge on PATH)
//   • dev server is NOT required for the deploy step; we boot it briefly for /api/setup

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { JsonRpcProvider, Wallet, formatEther } from "ethers";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const RPC = env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const provider = new JsonRpcProvider(RPC);

async function bal(addr, label) {
  const b = await provider.getBalance(addr);
  console.log(`  ${label.padEnd(10)} ${addr}  →  ${formatEther(b)} 0G`);
  return b;
}

console.log("→ Checking wallet balances on", RPC);
const deployer = new Wallet(env.DEPLOYER_PK, provider);
const principal = new Wallet(env.PRINCIPAL_PK, provider);
const agent = new Wallet(env.AGENT_PK, provider);
const dBal = await bal(deployer.address, "deployer");
const pBal = await bal(principal.address, "principal");
const aBal = await bal(agent.address, "agent");
if (dBal === 0n) {
  console.error("\n✗ DEPLOYER has 0 balance. Claim from https://faucet.0g.ai/ first.");
  process.exit(1);
}

console.log("\n→ Running forge script to deploy SpendPolicy");
const out = execSync(
  `forge script script/Deploy.s.sol --rpc-url ${RPC} --broadcast --legacy 2>&1`,
  { cwd: path.join(root, "..", "contracts"), env: { ...process.env, DEPLOYER_PK: env.DEPLOYER_PK }, stdio: "pipe" }
).toString();
const m = out.match(/SpendPolicy deployed at:\s*(0x[a-fA-F0-9]{40})/);
if (!m) {
  console.error(out);
  throw new Error("could not parse deployed address from forge output");
}
const addr = m[1];
console.log("✓ deployed at", addr);

const updated = fs.readFileSync(envPath, "utf8").replace(/SPEND_POLICY_ADDRESS=.*/, `SPEND_POLICY_ADDRESS=${addr}`);
fs.writeFileSync(envPath, updated);
console.log("✓ wrote SPEND_POLICY_ADDRESS to .env.local");

console.log("\n→ Booting dev server to run /api/setup …");
const server = spawn("npm", ["run", "dev"], {
  cwd: root,
  env: { ...process.env, PORT: "3010" },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((resolve) => {
  server.stdout.on("data", (d) => {
    const s = d.toString();
    process.stdout.write(s);
    if (s.includes("Ready in")) resolve();
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
});

const allowlist = env.ALICE_ADDRESS ? [env.ALICE_ADDRESS] : [];
const body = JSON.stringify({
  depositEther: "0.05",
  maxPerTxEther: "0.01",
  maxPerDayEther: "0.02",
  cooldownSeconds: 0,
  allowlist,
  allowlistOnly: true,
});

console.log("\n→ POST /api/setup", body);
const r = await fetch("http://localhost:3010/api/setup", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body,
});
const json = await r.json();
console.log(JSON.stringify(json, null, 2));

server.kill("SIGINT");
console.log(`\n✓ DONE — open http://localhost:3010 to demo. Contract:`);
console.log(`  ${env.ZG_EXPLORER || "https://chainscan-galileo.0g.ai"}/address/${addr}`);
