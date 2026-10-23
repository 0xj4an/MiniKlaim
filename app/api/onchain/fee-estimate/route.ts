import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { parseChainKey } from "@/lib/onchain/chains";
import { quoteClaimFee } from "@/lib/onchain/feeQuote";

export const dynamic = "force-dynamic";

// A claim never carries more than this; bigger asks are bogus.
const MAX_HEXES = 20_000;
const MAX_BADGES = 100;

function count(raw: string | null, max: number): number | null {
  const n = Number(raw ?? "0");
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(max, Math.floor(n));
}

/**
 * GET /api/onchain/fee-estimate?chain=celo&hexes=120&badges=2&address=0x...
 * The USD network fee for saving a run, shown on the claim sheet before the
 * wallet opens, and whether MiniKlaim will pay it. `address` is optional.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const chainKey = parseChainKey(url.searchParams.get("chain"));
  const hexCount = count(url.searchParams.get("hexes"), MAX_HEXES);
  const badgeCount = count(url.searchParams.get("badges"), MAX_BADGES);
  if (hexCount === null || badgeCount === null) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const raw = url.searchParams.get("address");
  if (raw && !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const player = raw ? (raw.toLowerCase() as Address) : null;
  const quote = await quoteClaimFee(db, {
    player,
    hexCount,
    badgeCount,
    chainKey,
  });
  return NextResponse.json(quote, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
