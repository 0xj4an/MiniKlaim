import { and, gt, inArray, notInArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexLosses, users } from "@/lib/db/schema";
import { addressesForPlayer } from "@/lib/players";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
/** Looked back when the caller does not say since when. */
const DEFAULT_WINDOW_MS = 3 * DAY_MS;
/** Rows are pruned after two weeks, so asking further back finds nothing. */
const MAX_WINDOW_MS = 14 * DAY_MS;
const MAX_ACTORS = 5;

/**
 * What other players did to this player's blocks since a moment in time:
 * blocks taken and levels knocked off, and who did it.
 *
 * `since` is epoch milliseconds, the last time the player saw this notice.
 * Every wallet linked to the player counts as theirs, and what one of their
 * own wallets did to another is not a loss.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(lower)) {
    return NextResponse.json({ error: "bad-address" }, { status: 400 });
  }

  const now = Date.now();
  const asked = Number(new URL(request.url).searchParams.get("since"));
  const since = new Date(
    Number.isFinite(asked) && asked > 0
      ? Math.min(now, Math.max(asked, now - MAX_WINDOW_MS))
      : now - DEFAULT_WINDOW_MS,
  );

  const mine = await addressesForPlayer(lower);
  const rows = await db
    .select({
      actor: hexLosses.actor,
      kind: hexLosses.kind,
      n: sql<number>`count(*)::int`,
    })
    .from(hexLosses)
    .where(
      and(
        inArray(hexLosses.victim, mine),
        notInArray(hexLosses.actor, mine),
        gt(hexLosses.createdAt, since),
      ),
    )
    .groupBy(hexLosses.actor, hexLosses.kind);

  const byActor = new Map<string, { captured: number; attacked: number }>();
  let captured = 0;
  let attacked = 0;
  for (const row of rows) {
    const entry = byActor.get(row.actor) ?? { captured: 0, attacked: 0 };
    if (row.kind === "capture") {
      entry.captured += row.n;
      captured += row.n;
    } else {
      entry.attacked += row.n;
      attacked += row.n;
    }
    byActor.set(row.actor, entry);
  }

  const top = [...byActor.entries()]
    .sort(
      (a, b) => b[1].captured + b[1].attacked - (a[1].captured + a[1].attacked),
    )
    .slice(0, MAX_ACTORS);
  const names = new Map<string, string | null>();
  if (top.length > 0) {
    const found = await db
      .select({ address: users.address, username: users.username })
      .from(users)
      .where(
        inArray(
          users.address,
          top.map(([actor]) => actor),
        ),
      );
    for (const u of found) names.set(u.address, u.username);
  }

  return NextResponse.json({
    since: since.toISOString(),
    captured,
    attacked,
    by: top.map(([actor, counts]) => ({
      address: actor,
      username: names.get(actor) ?? null,
      ...counts,
    })),
  });
}
