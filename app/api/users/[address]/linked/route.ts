import { NextResponse } from "next/server";
import { addressesForPlayer } from "@/lib/players";

export const dynamic = "force-dynamic";

/**
 * Every wallet address linked to this address's player (chain-agnostic).
 * Falls back to `[address]` when the wallet has no player yet. Used by the
 * client to color hexes as "mine" across every linked wallet, so a run
 * captured on wallet A shows green when connected as wallet B.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  const addresses = await addressesForPlayer(lower);
  return NextResponse.json({ addresses });
}
