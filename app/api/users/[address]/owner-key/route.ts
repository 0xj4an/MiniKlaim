import { NextResponse } from "next/server";
import { issueOwnerKey, parseRunProofs } from "@/lib/ownerKey";

export const dynamic = "force-dynamic";

/**
 * Hand the phone this wallet's owner key, which name changes and link codes
 * ask for. Free for a wallet that has nothing yet; a wallet that already
 * played shows the token of a run it started before owner keys existed.
 * Body: { runs?: [{ runId, token }] }. See lib/ownerKeyRules.ts.
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
  const body = (await request.json().catch(() => null)) as unknown;
  const key = await issueOwnerKey(lower, parseRunProofs(body));
  if (!key) {
    return NextResponse.json(
      { error: "cannot prove this wallet from this phone", code: "proof-needed" },
      { status: 403 },
    );
  }
  return NextResponse.json({ key });
}
