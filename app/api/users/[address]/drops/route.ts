import { NextResponse } from "next/server";
import type { Address } from "viem";
import { db } from "@/lib/db";
import { claimDropsForPlayer, playerTreasures, reconcileClaims } from "@/lib/drops/claim";
import { playerCanPay } from "@/lib/onchain/sponsor";
import {
  FEE_NATIVE_ONLY_HEADER,
  FEE_SHORTFALL_HEADER,
} from "@/lib/onchain/sponsorHeaders";
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

/** Gas of one `claimDropsFor` with a few drops, with room to spare. */
const DROP_CLAIM_GAS = BigInt(250_000);

/**
 * Relayer claim: the relayer pays the network fee and submits the claim. The
 * player pays when they can (`./voucher`); this is the fallback, so it is
 * refused (402) when the player holds enough to pay the fee themselves,
 * unless the client says their own attempt already failed
 * (`x-fee-shortfall`). The contract pays this address only, so a call for
 * someone else's wallet just pays them.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = parseAddress((await params).address);
  if (!address) return NextResponse.json({ error: "invalid address" }, { status: 400 });
  if (!isTreasuresEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  if (request.headers.get(FEE_SHORTFALL_HEADER) !== "1") {
    const pay = await playerCanPay(address as Address, 0, 0, "celo", {
      gas: DROP_CLAIM_GAS,
      nativeOnly: request.headers.get(FEE_NATIVE_ONLY_HEADER) === "1",
    }).catch(() => ({ canPay: false as const, via: undefined }));
    if (pay.canPay) {
      return NextResponse.json(
        { ok: false, reason: "player_can_pay", via: pay.via },
        { status: 402 },
      );
    }
  }
  const result = await claimDropsForPlayer(db, address);
  if (result.ok === true) return NextResponse.json(result);
  const status =
    result.reason === "not-configured" ? 503 : result.reason === "error" ? 502 : 409;
  return NextResponse.json({ ok: false, reason: result.reason }, { status });
}
