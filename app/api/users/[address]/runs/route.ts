import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "10");
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1),
    100,
  );

  const rows = await db
    .select({
      id: runs.id,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      hexesClaimed: runs.hexesClaimed,
    })
    .from(runs)
    .where(eq(runs.userAddress, lower))
    .orderBy(desc(runs.startedAt))
    .limit(limit);

  return NextResponse.json({ runs: rows });
}
