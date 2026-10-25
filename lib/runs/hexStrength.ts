import { sql, type SQL } from "drizzle-orm";

/**
 * Block strength (levels 1-10). The owner raises it by passing again, another
 * player lowers it by passing, and a block at level 1 changes owner on the
 * next attack and stays at level 1 for the new owner. There is no level 0.
 *
 * Stored per hex:
 * - `baseStrength`: the level right after the owner's last visit (1-10).
 * - `damage`: attacks since then (0 to baseStrength - 1).
 * - `reinforcedAt`: the owner's last visit, the decay clock.
 *
 * Decay is computed when read, never written by a job: one level per full
 * DECAY_DAYS without an owner visit, and it never goes below 1. Only an
 * attack can take a block. The owner's part (base, decays) and the
 * attackers' part (damage, does not decay) are kept apart so the months are
 * never subtracted twice.
 *
 * One action per block per player per day. That limit lives in the
 * `hex_actions` table (see the claim route), not here.
 */
export const MAX_STRENGTH = 10;
export const DECAY_DAYS = 30;
const DAY_MS = 86_400_000;

export type HexStrengthState = {
  baseStrength: number;
  damage: number;
  reinforcedAt: Date;
};

export function effectiveStrength(state: HexStrengthState, now: Date): number {
  const days = Math.max(0, (now.getTime() - state.reinforcedAt.getTime()) / DAY_MS);
  const months = Math.floor(days / DECAY_DAYS);
  const afterDamage = Math.max(1, state.baseStrength - state.damage);
  const decay = Math.min(months, afterDamage - 1);
  return Math.min(MAX_STRENGTH, Math.max(1, afterDamage - decay));
}

/** The same formula as `effectiveStrength`, in SQL, for read queries. */
export function strengthSql(
  base: SQL | unknown,
  damage: SQL | unknown,
  reinforcedAt: SQL | unknown,
): SQL<number> {
  const afterDamage = sql`greatest(1, ${base} - ${damage})`;
  const months = sql`floor(greatest(0, extract(epoch from (now() - ${reinforcedAt}))) / ${DECAY_DAYS * 86_400})::int`;
  return sql<number>`least(${MAX_STRENGTH}, greatest(1, ${afterDamage} - least(${months}, ${afterDamage} - 1)))::int`;
}

export type HexAction = "new" | "capture" | "reinforce" | "attack";

export type HexPlan =
  | { action: "new" | "capture"; strength: 1 }
  | { action: "reinforce"; strength: number; baseStrength: number }
  | { action: "attack"; strength: number };

/**
 * What one pass does to a block, before the daily limit is applied.
 * `current` is the locked row (null for a block nobody owns yet).
 * `strength` is the level after the pass.
 */
export function planHexAction(
  current: (HexStrengthState & { ownedByActor: boolean }) | null,
  now: Date,
): HexPlan {
  if (!current) return { action: "new", strength: 1 };
  const strength = effectiveStrength(current, now);
  if (current.ownedByActor) {
    const next = Math.min(MAX_STRENGTH, strength + 1);
    return { action: "reinforce", strength: next, baseStrength: next };
  }
  if (strength <= 1) return { action: "capture", strength: 1 };
  return { action: "attack", strength: strength - 1 };
}

/**
 * One key per player, so linked wallets share the daily limit: the lowest
 * lowercased address of the player.
 */
export function playerKey(addresses: Iterable<string>, fallback: string): string {
  let key: string | null = null;
  for (const a of addresses) {
    const lower = a.toLowerCase();
    if (key === null || lower < key) key = lower;
  }
  return key ?? fallback.toLowerCase();
}

/**
 * On for the server and the client. A Railway variable change rebuilds, so
 * this can be switched without a code change.
 */
export function isHexStrengthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HEX_STRENGTH === "on";
}
