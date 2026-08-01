import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { parseChainKey } from "@/lib/onchain/chains";
import { redeemLinkCode } from "@/lib/players";

export const dynamic = "force-dynamic";

/**
 * Redeem a link code by pointing at the ownership-proof tx the client just
 * broadcast. Tx must send 0 value to `chain.linkVerifier` with
 * `keccak256(code)` as calldata; backend reads the receipt to derive the
 * redeemer address and links it to the code's player. Returns 202 if the tx
 * hasn't confirmed yet so the client can retry.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    txHash?: string;
  };
  const code = body.code?.trim().toUpperCase();
  const txHash = body.txHash?.trim() as Hex | undefined;
  if (!code || !txHash || !/^0x[a-f0-9]{64}$/i.test(txHash)) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const chainKey = parseChainKey(new URL(request.url).searchParams.get("chain"));
  const result = await redeemLinkCode(code, chainKey, txHash);
  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  const reason = result.reason ?? "error";
  const status =
    reason === "bad-code" ? 404 : reason === "tx-pending" ? 202 : 400;
  return NextResponse.json({ error: reason }, { status });
}
