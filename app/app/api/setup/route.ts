import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { agentWallet, principalWallet, spendPolicyContract } from "@/lib/chain";
import { commitToStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot demo setup: deposit funds, set policy, register agent, configure allowlist.
 * Call once after deploy. Idempotent — re-running is fine.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    depositEther?: string;
    maxPerTxEther?: string;
    maxPerDayEther?: string;
    cooldownSeconds?: number;
    allowlist?: string[];
    allowlistOnly?: boolean;
  };

  const depositEther = body.depositEther ?? "0.05";
  const maxPerTxEther = body.maxPerTxEther ?? "0.01";
  const maxPerDayEther = body.maxPerDayEther ?? "0.02";
  const cooldownSeconds = body.cooldownSeconds ?? 0;
  const allowlist = body.allowlist ?? [];
  const allowlistOnly = body.allowlistOnly ?? false;

  const principal = principalWallet();
  const agent = agentWallet();
  const cP = spendPolicyContract(principal);

  const out: Record<string, string> = {};

  const tx1 = await cP.setPolicy(
    ethers.parseEther(maxPerTxEther),
    ethers.parseEther(maxPerDayEther),
    cooldownSeconds,
    allowlistOnly
  );
  await tx1.wait();
  out.setPolicy = tx1.hash;

  const commit = await commitToStorage({
    kind: "agent_id_doc",
    principal: principal.address,
    agent: agent.address,
    createdAt: new Date().toISOString(),
    policy: { maxPerTxEther, maxPerDayEther, cooldownSeconds, allowlistOnly },
  });
  const tx2 = await cP.registerAgent(agent.address, commit.root);
  await tx2.wait();
  out.registerAgent = tx2.hash;
  out.agentIdRoot = commit.root;

  for (const recipient of allowlist) {
    const t = await cP.setAllowlist(recipient, true);
    await t.wait();
    out[`allowlist:${recipient}`] = t.hash;
  }

  const tx3 = await cP.deposit({ value: ethers.parseEther(depositEther) });
  await tx3.wait();
  out.deposit = tx3.hash;

  return NextResponse.json({ ok: true, txs: out });
}
