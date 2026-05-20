import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Row<T> = T;

export async function GET() {
  const queries = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS c FROM users`),
    db.execute(sql`SELECT COUNT(*)::int AS c FROM hexes`),
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM runs WHERE ended_at IS NOT NULL`,
    ),
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM runs WHERE ended_at >= now() - interval '24 hours'`,
    ),
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM runs WHERE ended_at >= now() - interval '7 days'`,
    ),
    db.execute(
      sql`SELECT COUNT(DISTINCT user_address)::int AS c FROM runs WHERE ended_at >= now() - interval '7 days'`,
    ),
    db.execute(
      sql`SELECT COALESCE(SUM(distance_meters), 0)::int AS c FROM runs`,
    ),
  ]);

  const [
    users,
    hexes,
    runsLifetime,
    runs24h,
    runs7d,
    activePlayers7d,
    distance,
  ] = queries.map(
    (q) => (q as unknown as Row<Array<{ c: number }>>)[0]?.c ?? 0,
  );

  return NextResponse.json({
    totalPlayers: users,
    totalBlocks: hexes,
    runsLifetime,
    runs24h,
    runs7d,
    activePlayers7d,
    totalDistanceMeters: distance,
  });
}
