import { count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexes, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "10");
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 10, 1),
    100,
  );

  const rows = await db
    .select({
      address: users.address,
      username: users.username,
      hexCount: count(hexes.h3Id),
    })
    .from(users)
    .leftJoin(hexes, eq(hexes.ownerAddress, users.address))
    .groupBy(users.address, users.username)
    .orderBy(desc(count(hexes.h3Id)))
    .limit(limit);

  return NextResponse.json({ leaderboard: rows });
}
