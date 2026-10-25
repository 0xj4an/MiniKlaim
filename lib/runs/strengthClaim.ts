import { inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { hexActions, hexes } from "@/lib/db/schema";
import {
  type HexAction,
  type HexPlan,
  effectiveStrength,
  planHexAction,
  playerKey,
} from "@/lib/runs/hexStrength";
import { localDay } from "@/lib/runs/streakMath";

export type StrengthOutcome = {
  action: HexAction | "repeat";
  /** Level after this pass, 1-10. */
  strength: number;
  /** The block belongs to this player after the pass. */
  ownedByActor: boolean;
};

export type StrengthBatchResult = {
  byH3: Map<string, StrengthOutcome>;
  /** new + capture: blocks this run now owns that it did not before. */
  captured: number;
  /** capture only: taken from another player. */
  conquests: number;
  reinforced: number;
  damaged: number;
};

type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

/**
 * Apply one claim batch under hex strength, in one transaction:
 * lock the rows, plan each pass, record today's actions (the insert that
 * conflicts is the once-per-day limit), then write captures, reinforces and
 * attacks. Movement guard and validation already ran; every h3 here was
 * accepted.
 *
 * Reinforce and attack never touch run_id, claimed_at or the mint columns:
 * settlement finds a run's blocks by run_id, and a reinforced block is
 * already settled for its owner.
 */
export async function applyStrengthBatch(
  database: Db,
  params: {
    runId: string;
    actor: string;
    playerAddresses: ReadonlySet<string>;
    timeZone: string | null;
    h3Ids: string[];
    geo: (h3: string) => { country: string | null; city: string | null };
    now: Date;
  },
): Promise<StrengthBatchResult> {
  const { runId, actor, playerAddresses, timeZone, now } = params;
  const ids = Array.from(new Set(params.h3Ids.filter(Boolean)));
  const out: StrengthBatchResult = {
    byH3: new Map(),
    captured: 0,
    conquests: 0,
    reinforced: 0,
    damaged: 0,
  };
  if (ids.length === 0) return out;

  await database.transaction(async (tx) => {
    const rows = await tx
      .select({
        h3Id: hexes.h3Id,
        ownerAddress: hexes.ownerAddress,
        baseStrength: hexes.baseStrength,
        damage: hexes.damage,
        reinforcedAt: hexes.reinforcedAt,
      })
      .from(hexes)
      .where(inArray(hexes.h3Id, ids))
      .for("update");
    const byId = new Map(rows.map((r) => [r.h3Id, r]));

    const plans = new Map<string, HexPlan & { ownedByActor: boolean; exists: boolean }>();
    for (const h3 of ids) {
      const row = byId.get(h3);
      const ownedByActor = !!row && playerAddresses.has(row.ownerAddress.toLowerCase());
      const plan = planHexAction(
        row
          ? {
              baseStrength: row.baseStrength,
              damage: row.damage,
              reinforcedAt: row.reinforcedAt,
              ownedByActor,
            }
          : null,
        now,
      );
      plans.set(h3, { ...plan, ownedByActor, exists: !!row });
    }

    const key = playerKey(playerAddresses, actor);
    const day = localDay(now.getTime(), timeZone);
    const inserted = await tx
      .insert(hexActions)
      .values(
        ids.map((h3) => ({
          h3Id: h3,
          playerKey: key,
          day,
          kind: plans.get(h3)!.action,
        })),
      )
      .onConflictDoNothing()
      .returning({ h3Id: hexActions.h3Id });
    const acted = new Set(inserted.map((r) => r.h3Id));

    const captureRows: Array<typeof hexes.$inferInsert> = [];
    const reinforceByLevel = new Map<number, string[]>();
    const attacks: string[] = [];

    for (const h3 of ids) {
      const plan = plans.get(h3)!;
      // A block nobody owns is always captured: a missing row cannot be a
      // repeat, whatever the action log says.
      if (!acted.has(h3) && plan.exists) {
        const row = byId.get(h3)!;
        out.byH3.set(h3, {
          action: "repeat",
          strength: effectiveStrength(row, now),
          ownedByActor: plan.ownedByActor,
        });
        continue;
      }
      if (plan.action === "new" || plan.action === "capture") {
        const { country, city } = params.geo(h3);
        captureRows.push({
          h3Id: h3,
          ownerAddress: actor,
          runId,
          country,
          city,
          baseStrength: 1,
          damage: 0,
          reinforcedAt: now,
        });
        out.captured += 1;
        if (plan.action === "capture") out.conquests += 1;
        out.byH3.set(h3, { action: plan.action, strength: 1, ownedByActor: true });
      } else if (plan.action === "reinforce") {
        const list = reinforceByLevel.get(plan.baseStrength) ?? [];
        list.push(h3);
        reinforceByLevel.set(plan.baseStrength, list);
        out.reinforced += 1;
        out.byH3.set(h3, { action: "reinforce", strength: plan.strength, ownedByActor: true });
      } else {
        attacks.push(h3);
        out.damaged += 1;
        out.byH3.set(h3, { action: "attack", strength: plan.strength, ownedByActor: false });
      }
    }

    if (captureRows.length > 0) {
      await tx
        .insert(hexes)
        .values(captureRows)
        .onConflictDoUpdate({
          target: hexes.h3Id,
          set: {
            ownerAddress: sql`excluded.owner_address`,
            runId: sql`excluded.run_id`,
            claimedAt: sql`now()`,
            country: sql`excluded.country`,
            city: sql`excluded.city`,
            // New owner: clear the old settlement so this run settles it.
            mintedAt: null,
            mintTxHash: null,
            baseStrength: 1,
            damage: 0,
            reinforcedAt: sql`excluded.reinforced_at`,
          },
        });
    }
    for (const [level, list] of reinforceByLevel) {
      await tx
        .update(hexes)
        .set({ baseStrength: level, damage: 0, reinforcedAt: now })
        .where(inArray(hexes.h3Id, list));
    }
    if (attacks.length > 0) {
      await tx
        .update(hexes)
        .set({ damage: sql`${hexes.damage} + 1` })
        .where(inArray(hexes.h3Id, attacks));
    }
  });

  return out;
}
