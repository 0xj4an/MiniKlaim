import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:runs:active");

export const dynamic = "force-dynamic";

const STALE_AFTER_HOURS = 2;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();

  // Auto-finish any "active" runs older than STALE_AFTER_HOURS. These are
  // sessions the user abandoned (closed tab, lost wallet, etc.). Mark them
  // ended at started_at + interval so the duration in history is honest.
  const cleaned = await db
    .update(runs)
    .set({
      endedAt: sql`${runs.startedAt} + interval '${sql.raw(String(STALE_AFTER_HOURS))} hours'`,
    })
    .where(
      and(
        eq(runs.userAddress, lower),
        isNull(runs.endedAt),
        lt(
          runs.startedAt,
          sql`now() - interval '${sql.raw(String(STALE_AFTER_HOURS))} hours'`,
        ),
      ),
    )
    .returning({ id: runs.id });

  if (cleaned.length > 0) {
    log.info("stale runs auto-finished", {
      address: lower,
      count: cleaned.length,
    });
  }

  const [active] = await db
    .select({
      id: runs.id,
      startedAt: runs.startedAt,
      endedAt: runs.endedAt,
      hexesClaimed: runs.hexesClaimed,
    })
    .from(runs)
    .where(and(eq(runs.userAddress, lower), isNull(runs.endedAt)))
    .orderBy(desc(runs.startedAt))
    .limit(1);

  return NextResponse.json({ active: active ?? null });
}
