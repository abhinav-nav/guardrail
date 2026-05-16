import { NextResponse } from "next/server";
import { ethers } from "ethers";
import {
  agentWallet,
  principalWallet,
  spendPolicyContract,
  addrUrl,
  ZG_EXPLORER,
  SPEND_POLICY_ADDRESS,
} from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = principalWallet();
    const agent = agentWallet();
    const c = spendPolicyContract();

    const [policy, balance, isAgentBool, idRoot] = await Promise.all([
      c.policyOf(principal.address),
      c.balanceOf(principal.address),
      c.isAgent(principal.address, agent.address),
      c.agentIdRoot(principal.address),
    ]);

    return NextResponse.json({
      contract: SPEND_POLICY_ADDRESS,
      contractUrl: addrUrl(SPEND_POLICY_ADDRESS),
      explorer: ZG_EXPLORER,
      principal: { address: principal.address, url: addrUrl(principal.address) },
      agent: { address: agent.address, url: addrUrl(agent.address), registered: Boolean(isAgentBool) },
      policy: {
        exists: Boolean(policy[4]),
        maxPerTx: ethers.formatEther(policy[0]),
        maxPerDay: ethers.formatEther(policy[1]),
        cooldownSeconds: Number(policy[2]),
        allowlistOnly: Boolean(policy[3]),
      },
      balanceWei: balance.toString(),
      balanceEther: ethers.formatEther(balance),
      agentIdRoot: idRoot,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
