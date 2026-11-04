import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { gridDisk } from "h3-js";
import { dropFinds, drops } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { createSharedCache } from "@/lib/sharedCache";
import type { MoveMode } from "@/lib/runs/moveMode";
import { DROP_ELIGIBLE_MODES, dropRules, isTreasuresEnabled } from "@/lib/drops/config";
import { judgeFind } from "@/lib/drops/rules";

const log = createLogger("drops:detect");

type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export type ActiveDrop = {
  id: string;
  h3: string;
  label: string | null;
  clue: string | null;
  token: string;
  amount: string;
  startsAt: Date;
};

/**
 * Active drops, plus ring-1 cell -> drops whose block is that cell or
 * touches it.
 */
type DropIndex = { list: ActiveDrop[]; byCell: Map<string, ActiveDrop[]> };

const INDEX_TTL_MS = 60_000;
const indexCache = createSharedCache<DropIndex>(INDEX_TTL_MS);

export function clearDropIndex(): void {
  indexCache.clear();
}

async function loadIndex(database: Db, now: Date): Promise<DropIndex> {
  const rows = await database
    .select({
      id: drops.id,
      h3: drops.h3,
      label: drops.label,
      clue: drops.clue,
      token: drops.token,
      amount: drops.amount,
      startsAt: drops.startsAt,
    })
    .from(drops)
    .where(and(eq(drops.status, "active"), lte(drops.startsAt, now), gt(drops.endsAt, now)));
  const byCell = new Map<string, ActiveDrop[]>();
  for (const d of rows) {
    for (const cell of gridDisk(d.h3, 1)) {
      const list = byCell.get(cell) ?? [];
      list.push(d);
      byCell.set(cell, list);
    }
  }
  return { list: rows, byCell };
}

/** Open treasures, cached for a minute. Server-only: carries the blocks. */
export async function activeDrops(database: Db, now: Date): Promise<ActiveDrop[]> {
  return (await indexCache.get("active", () => loadIndex(database, now))).list;
}

export type FoundDrop = {
  dropId: string;
  label: string | null;
  token: string;
  amount: string;
};

export type DetectParams = {
  runId: string;
  player: string;
  declaredMode: MoveMode | null;
  /** Blocks of this batch the movement guard and validation accepted. */
  accepted: Array<{ h3: string; accuracy: number | null }>;
  now: Date;
};

/**
 * Track passes near active treasures and settle finds. Runs after the
 * movement guard, on accepted blocks only, and never changes territory play.
 * Returns the drops this batch won.
 *
 * A find needs the drop block crossed with good accuracy and a dwell window
 * (two or more batches inside the block or its ring-1 neighbours, 10 s or
 * more apart). The winner is decided under a row lock on the drop, and the
 * partial unique index on drop_finds is the backstop.
 */
export async function detectDrops(database: Db, params: DetectParams): Promise<FoundDrop[]> {
  if (!isTreasuresEnabled() || params.accepted.length === 0) return [];
  const { runId, now } = params;
  const player = params.player.toLowerCase();
  const index = await indexCache.get("active", () => loadIndex(database, now));
  if (index.list.length === 0) return [];

  const near = new Map<string, { drop: ActiveDrop; crossed: boolean; accuracy: number | null }>();
  for (const { h3, accuracy } of params.accepted) {
    for (const drop of index.byCell.get(h3) ?? []) {
      const entry = near.get(drop.id) ?? { drop, crossed: false, accuracy: null };
      if (h3 === drop.h3) {
        entry.crossed = true;
        entry.accuracy = accuracy === null ? null : Math.round(accuracy);
      }
      near.set(drop.id, entry);
    }
  }
  if (near.size === 0) return [];

  const rules = dropRules();
  const found: FoundDrop[] = [];
  const alreadyWon = new Set(
    (
      await database
        .select({ dropId: dropFinds.dropId })
        .from(dropFinds)
        .where(
          and(
            eq(dropFinds.player, player),
            eq(dropFinds.review, "ok"),
            inArray(dropFinds.dropId, Array.from(near.keys())),
          ),
        )
    ).map((r) => r.dropId),
  );
  for (const { drop, crossed, accuracy } of near.values()) {
    // One prize per player per drop: a winner walking past again is ignored.
    if (alreadyWon.has(drop.id)) continue;
    const [row] = await database
      .insert(dropFinds)
      .values({
        dropId: drop.id,
        player,
        runId,
        firstNearAt: now,
        lastNearAt: now,
        nearBatches: 1,
        crossedAt: crossed ? now : null,
        accuracyM: crossed ? accuracy : null,
      })
      .onConflictDoUpdate({
        target: [dropFinds.dropId, dropFinds.runId],
        set: {
          lastNearAt: now,
          nearBatches: sql`${dropFinds.nearBatches} + 1`,
          crossedAt: sql`coalesce(${dropFinds.crossedAt}, excluded.crossed_at)`,
          accuracyM: sql`case when ${dropFinds.crossedAt} is null then excluded.accuracy_m else ${dropFinds.accuracyM} end`,
        },
        setWhere: eq(dropFinds.review, "pending"),
      })
      .returning();
    // Not pending any more: decided on an earlier batch.
    if (!row) continue;

    const verdict = judgeFind(row, {
      declaredMode: params.declaredMode,
      eligibleModes: DROP_ELIGIBLE_MODES,
      dropStartsAt: drop.startsAt,
      rules,
    });
    if (verdict.review === "pending") continue;

    if (verdict.review !== "ok") {
      await database
        .update(dropFinds)
        .set({ review: verdict.review, reviewReason: verdict.reason })
        .where(eq(dropFinds.id, row.id));
      log.warn("treasure find held", { dropId: drop.id, runId, player, review: verdict.review, reason: verdict.reason });
      continue;
    }

    const won = await awardFind(database, drop.id, row.id, now);
    if (won) {
      found.push({ dropId: drop.id, label: drop.label, token: drop.token, amount: drop.amount });
      indexCache.clear();
      log.warn("treasure found", { dropId: drop.id, runId, player });
    }
  }
  return found;
}

/**
 * Award `findId` one prize of `dropId` if a slot is left and this player has
 * not won this drop yet. Shared by detection and admin approval of a flagged
 * find. The row lock on the drop serialises concurrent winners; the partial
 * unique index (one ok find per drop and player) is the backstop.
 */
export async function awardFind(database: Db, dropId: string, findId: string, now: Date): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [d] = await tx
      .select({ status: drops.status, maxWinners: drops.maxWinners })
      .from(drops)
      .where(eq(drops.id, dropId))
      .for("update");
    const [f] = await tx
      .select({ player: dropFinds.player })
      .from(dropFinds)
      .where(eq(dropFinds.id, findId));
    if (!d || !f || d.status !== "active") {
      await tx.update(dropFinds).set({ review: "late" }).where(eq(dropFinds.id, findId));
      return false;
    }
    const winners = await tx
      .select({ player: dropFinds.player })
      .from(dropFinds)
      .where(and(eq(dropFinds.dropId, dropId), eq(dropFinds.review, "ok")));
    if (winners.some((w) => w.player === f.player)) {
      await tx
        .update(dropFinds)
        .set({ review: "late", reviewReason: "already-won" })
        .where(eq(dropFinds.id, findId));
      return false;
    }
    if (winners.length >= d.maxWinners) {
      await tx.update(dropFinds).set({ review: "late" }).where(eq(dropFinds.id, findId));
      await tx.update(drops).set({ status: "found" }).where(eq(drops.id, dropId));
      return false;
    }
    await tx.update(dropFinds).set({ review: "ok", reviewReason: null, foundAt: now }).where(eq(dropFinds.id, findId));
    if (winners.length + 1 >= d.maxWinners) {
      await tx.update(drops).set({ status: "found" }).where(eq(drops.id, dropId));
    }
    return true;
  });
}

/** Public view for hints: never the block or salt. */
export async function activeHints(database: Db, now: Date) {
  return database
    .select({
      id: drops.id,
      hintH3: drops.hintH3,
      label: drops.label,
      clue: drops.clue,
      token: drops.token,
      amount: drops.amount,
      maxWinners: drops.maxWinners,
      winnersLeft: sql<number>`(${drops.maxWinners} - (select count(*) from ${dropFinds} where ${dropFinds.dropId} = ${drops.id} and ${dropFinds.review} = 'ok'))::int`,
      endsAt: drops.endsAt,
    })
    .from(drops)
    .where(and(eq(drops.status, "active"), lte(drops.startsAt, now), gt(drops.endsAt, now)));
}
