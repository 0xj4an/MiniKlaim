import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, runs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();

  const [hexResult, runResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(hexes)
      .where(eq(hexes.ownerAddress, lower)),
    db.select({ count: count() }).from(runs).where(eq(runs.userAddress, lower)),
  ]);

  return NextResponse.json({
    hexesOwned: hexResult[0]?.count ?? 0,
    totalRuns: runResult[0]?.count ?? 0,
  });
}
