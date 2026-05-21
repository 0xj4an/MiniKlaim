import { desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "10");
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1),
    50,
  );

  const rows = await db
    .select({
      id: runs.id,
      address: runs.userAddress,
      username: users.username,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      hexesClaimed: runs.hexesClaimed,
      distanceMeters: runs.distanceMeters,
    })
    .from(runs)
    .leftJoin(users, eq(runs.userAddress, users.address))
    .where(isNotNull(runs.endedAt))
    .orderBy(desc(runs.endedAt))
    .limit(limit);

  return NextResponse.json({ activity: rows });
}
