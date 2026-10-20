import { and, inArray, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import { db } from "@/lib/db";
import { hexes } from "@/lib/db/schema";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { captureBatch, hexesPublicClient } from "@/lib/onchain/hexes";
import { mintedTo, mintTokensLog as log } from "@/lib/onchain/mintTokens";

export const dynamic = "force-dynamic";

/**
 * Record the tokens a player's `mintTokens` tx created. Everything is read from
 * the receipt (Transfer events from the zero address to the sender), so the
 * body only carries the tx hash and a forged call changes nothing.
 *
 * If a hex was recaptured between the voucher and the mint, the new token sits
 * with the minter while the database names someone else. The relayer records
 * it to the current owner, which moves the token.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const chainKey = parseChainKey(new URL(request.url).searchParams.get("chain"));
  const body = (await request.json().catch(() => null)) as { txHash?: string } | null;
  const txHash = body?.txHash;
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "invalid txHash" }, { status: 400 });
  }

  const { hexesAddress } = getChain(chainKey);
  const client = hexesPublicClient(chainKey);
  const receipt = await client
    .waitForTransactionReceipt({ hash: txHash as Hex, timeout: 60_000 })
    .catch(() => null);
  if (!receipt) {
    return NextResponse.json({ error: "receipt not found" }, { status: 404 });
  }
  if (
    receipt.status !== "success" ||
    receipt.from.toLowerCase() !== lower ||
    receipt.to?.toLowerCase() !== hexesAddress.toLowerCase()
  ) {
    return NextResponse.json({ error: "not a mint by this wallet" }, { status: 400 });
  }

  const minted = mintedTo(receipt.logs, hexesAddress, lower as Address);
  if (minted.length === 0) {
    return NextResponse.json({ minted: 0 });
  }

  await db
    .update(hexes)
    .set({ tokenAt: sql`now()` })
    .where(inArray(hexes.h3Id, minted));

  const drift = await db
    .select({ h3Id: hexes.h3Id, owner: hexes.ownerAddress })
    .from(hexes)
    .where(and(inArray(hexes.h3Id, minted), ne(hexes.ownerAddress, lower)));
  const byOwner = new Map<string, string[]>();
  for (const d of drift) byOwner.set(d.owner, [...(byOwner.get(d.owner) ?? []), d.h3Id]);
  for (const [owner, ids] of byOwner) {
    const moved = await captureBatch(owner as Address, ids, chainKey);
    log.warn("minted token recaptured meanwhile; moved to db owner", {
      minter: lower,
      owner,
      count: ids.length,
      ok: moved.ok,
    });
  }

  log.info("tokens minted", { player: lower, count: minted.length, txHash, chainKey });
  return NextResponse.json({ minted: minted.length });
}
