import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { claimDropsForPlayer, playerTreasures, reconcileClaims } from "@/lib/drops/claim";
import { isTreasuresEnabled } from "@/lib/drops/config";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:users:drops");

export const dynamic = "force-dynamic";

function parseAddress(raw: string): string | null {
  const lower = raw.toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(lower) ? lower : null;
}

/** The wallet's won treasures. Settles sent claims from their receipts first. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = parseAddress((await params).address);
  if (!address) return NextResponse.json({ error: "invalid address" }, { status: 400 });
  if (!isTreasuresEnabled()) return NextResponse.json({ treasures: [] });
  try {
    await reconcileClaims(db, address).catch((e) =>
      log.warn("reconcile failed", { address, error: String(e).slice(0, 200) }),
    );
    const treasures = await playerTreasures(db, address);
    return NextResponse.json({ treasures });
  } catch (e) {
    log.error("treasures read failed", {
      address,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    });
    return NextResponse.json({ error: "error" }, { status: 500 });
  }
}

/**
 * The player tapped "Claim". The relayer pays the network fee and submits the
 * claim; the player signs nothing (MiniPay cannot sign messages). The
 * contract pays this address only, so a call for someone else's wallet just
 * pays them.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = parseAddress((await params).address);
  if (!address) return NextResponse.json({ error: "invalid address" }, { status: 400 });
  if (!isTreasuresEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const result = await claimDropsForPlayer(db, address);
  if (result.ok === true) return NextResponse.json(result);
  const status =
    result.reason === "not-configured" ? 503 : result.reason === "error" ? 502 : 409;
  return NextResponse.json({ ok: false, reason: result.reason }, { status });
}
