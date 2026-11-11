import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hexActions, users } from "@/lib/db/schema";
import { addressesForPlayer } from "@/lib/players";
import { playerKey } from "@/lib/runs/hexStrength";
import { localDay } from "@/lib/runs/streakMath";

export const dynamic = "force-dynamic";

// A day of play is a few thousand blocks at the very most. The cap keeps a
// runaway day from turning this into a large response.
const MAX_ROWS = 5000;

/**
 * The blocks this player has already acted on today.
 *
 * A block takes one action per player per day (see `hexActions`), and until
 * now the only way to find out a block was spent was to walk onto it and
 * watch nothing happen. Measured on 10 Nov 2026, the first half day the run
 * screen reported why a run ended with zero blocks: 15 of 42 such runs, from
 * 7 players, were this limit. The run map marks these blocks so the player
 * can see them before walking there.
 *
 * The key and the day are computed exactly as the claim route computes them,
 * or the marks would disagree with what the server then accepts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const lower = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(lower)) {
    return NextResponse.json({ error: "bad-address" }, { status: 400 });
  }

  const [linked, [user]] = await Promise.all([
    addressesForPlayer(lower),
    db
      .select({ timeZone: users.timeZone })
      .from(users)
      .where(eq(users.address, lower))
      .limit(1),
  ]);
  const key = playerKey(linked, lower);
  const day = localDay(Date.now(), user?.timeZone ?? null);

  const rows = await db
    .select({ h3: hexActions.h3Id })
    .from(hexActions)
    .where(and(eq(hexActions.playerKey, key), eq(hexActions.day, day)))
    .limit(MAX_ROWS);

  return NextResponse.json({ day, h3: rows.map((r) => r.h3) });
}
