import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { db } from "@/lib/db";
import { claimVoucherForPlayer, recordPlayerClaimTx } from "@/lib/drops/claim";
import { isTreasuresEnabled } from "@/lib/drops/config";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:users:drops:voucher");

export const dynamic = "force-dynamic";

function parseAddress(raw: string): string | null {
  const lower = raw.toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(lower) ? lower : null;
}

/**
 * The player pays the fee: a signed `claimDropsFor` voucher for this wallet's
 * unpaid finds. Anyone may ask; the contract pays the named player only.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = parseAddress((await params).address);
  if (!address) return NextResponse.json({ error: "invalid address" }, { status: 400 });
  if (!isTreasuresEnabled()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  try {
    const r = await claimVoucherForPlayer(db, address);
    if (r.ok === true) return NextResponse.json(r.voucher);
    return NextResponse.json(
      { ok: false, reason: r.reason },
      { status: r.reason === "not-configured" ? 503 : 409 },
    );
  } catch (e) {
    log.error("drop voucher failed", {
      address,
      error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
    });
    return NextResponse.json({ ok: false, reason: "error" }, { status: 502 });
  }
}

/** The player sent the voucher's tx: `{ nonce, txHash }`. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const address = parseAddress((await params).address);
  if (!address) return NextResponse.json({ error: "invalid address" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { nonce?: unknown; txHash?: unknown };
  const nonce = typeof body.nonce === "string" && /^\d{1,78}$/.test(body.nonce) ? body.nonce : null;
  const txHash =
    typeof body.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.txHash) ? (body.txHash as Hex) : null;
  if (!nonce || !txHash) return NextResponse.json({ error: "nonce and txHash required" }, { status: 400 });
  const n = await recordPlayerClaimTx(db, address, nonce, txHash);
  return NextResponse.json({ ok: n > 0, count: n }, { status: n > 0 ? 200 : 409 });
}
