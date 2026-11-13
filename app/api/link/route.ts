import { NextResponse } from "next/server";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { requestHasOwnerKey } from "@/lib/ownerKey";
import { createLinkCode } from "@/lib/players";

export const dynamic = "force-dynamic";

/** Generate a short-lived link code bound to the requesting wallet's player. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { address?: string };
  const lower = (body.address ?? "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  // The code pulls whichever wallet redeems it into this wallet's player, so
  // only the phone that owns this wallet may create one. The redeeming wallet
  // proves itself with its own transaction.
  if (!(await requestHasOwnerKey(request, lower))) {
    return NextResponse.json(
      { error: "this phone cannot link this wallet", code: "proof-needed" },
      { status: 403 },
    );
  }
  const chainId = getChain(
    parseChainKey(new URL(request.url).searchParams.get("chain")),
  ).chainId;
  const code = await createLinkCode(lower, chainId);
  return NextResponse.json({ code });
}
