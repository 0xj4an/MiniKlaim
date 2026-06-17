import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { parseChainKey } from "@/lib/onchain/chains";
import { redeemLinkCode } from "@/lib/players";

export const dynamic = "force-dynamic";

/** Redeem a link code from a new wallet (proven by a signature of the challenge). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    address?: string;
    signature?: string;
  };
  const code = body.code?.trim().toUpperCase();
  const lower = (body.address ?? "").toLowerCase();
  if (!code || !/^0x[a-f0-9]{40}$/.test(lower) || !body.signature) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const chainKey = parseChainKey(new URL(request.url).searchParams.get("chain"));
  const result = await redeemLinkCode(
    code,
    lower,
    chainKey,
    body.signature as Hex,
  );
  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  const reason = result.reason ?? "error";
  return NextResponse.json(
    { error: reason },
    { status: reason === "bad-code" ? 404 : 400 },
  );
}
