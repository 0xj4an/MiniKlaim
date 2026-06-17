import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getChain, parseChainKey } from "@/lib/onchain/chains";
import { usernameForAddress } from "@/lib/players";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  const chainId = getChain(
    parseChainKey(new URL(request.url).searchParams.get("chain")),
  ).chainId;

  const [u] = await db
    .select({ username: users.username, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.address, lower))
    .limit(1);

  // Shared username resolves across linked wallets (e.g. Soneium inherits Celo).
  const sharedName = await usernameForAddress(lower, chainId);
  const username = sharedName ?? u?.username ?? null;

  if (!u && sharedName === null) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: {
      address: lower,
      username,
      createdAt: u?.createdAt ?? new Date().toISOString(),
    },
  });
}
