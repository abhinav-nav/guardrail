import { ethers } from "ethers";
import crypto from "crypto";

/**
 * Upload a JSON blob (reasoning trace / memory snapshot) to 0G Storage and
 * return { root, txHash, fallback }.  Root is the Merkle root used as the
 * memoryRoot anchor passed to SpendPolicy.executeTx().
 *
 * If the indexer is unreachable (network hiccup, demo offline mode), we still
 * return a deterministic keccak256 commitment so the chain audit log is intact.
 * This keeps the demo robust without faking 0G usage — when the indexer is up,
 * the data really lives on 0G Storage.
 */
export async function commitToStorage(payload: unknown): Promise<{
  root: `0x${string}`;
  txHash?: string;
  fallback: boolean;
  size: number;
}> {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const localRoot = ("0x" + crypto.createHash("sha256").update(bytes).digest("hex")) as `0x${string}`;

  const indexer = process.env.ZG_INDEXER_RPC;
  const pk = process.env.AGENT_PK;
  if (!indexer || !pk) {
    return { root: localRoot, fallback: true, size: bytes.length };
  }

  try {
    const sdk = await import("@0glabs/0g-ts-sdk");
    const { Indexer, MemData } = sdk as unknown as {
      Indexer: new (rpc: string) => {
        upload: (
          data: unknown,
          rpc: string,
          signer: ethers.Wallet
        ) => Promise<[unknown, string | undefined]>;
      };
      MemData: new (buf: Buffer | Uint8Array) => {
        merkleTree: () => Promise<[{ rootHash: () => string } | null, Error | null]>;
      };
    };

    const rpc = process.env.ZG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(pk, provider);

    const data = new MemData(Buffer.from(bytes));
    const [tree, treeErr] = await data.merkleTree();
    if (treeErr || !tree) throw treeErr ?? new Error("merkle tree failed");
    const root = tree.rootHash() as `0x${string}`;

    const ix = new Indexer(indexer);
    const [, txHash] = await ix.upload(data, rpc, wallet);

    return { root, txHash, fallback: false, size: bytes.length };
  } catch (e) {
    console.warn("[0G Storage] upload failed, using local commitment:", (e as Error).message);
    return { root: localRoot, fallback: true, size: bytes.length };
  }
}
