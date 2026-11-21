import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Address } from "viem";
import { resolveQualified } from "@/lib/challenges/qualified";
import { challengeEntries, type Challenge } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { onchainBadgeIdsHeld } from "@/lib/onchain/badges";
import { addressesForPlayer } from "@/lib/players";
import { createSharedCache } from "@/lib/sharedCache";

const log = createLogger("challenges:qualified");

type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

/**
 * How many entrants would be in the draw if it ran now: those holding every
 * badge of the challenge onchain (lib/challenges/qualified, the draw's own
 * rule). The card showed how many entered and how many win, and nothing
 * about how many of them are actually in the running.
 *
 * One `balanceOfBatch` per entrant wallet, so it is kept for five minutes
 * and served stale while it refreshes. Once the draw has run, the stored
 * result is the answer. `null` when it cannot be read: a failed badge read
 * comes back as "holds none", and a count that is quietly too low is worse
 * than no count.
 */
const QUALIFIED_TTL_MS = 5 * 60_000;
const qualifiedShared = createSharedCache<number | null>(QUALIFIED_TTL_MS, {
  serveStaleWhileRevalidating: true,
});

export function qualifiedCount(database: Db, c: Challenge): Promise<number | null> {
  const drawn = (c.result as { qualified?: unknown } | null)?.qualified;
  if (Array.isArray(drawn)) return Promise.resolve(drawn.length);
  return qualifiedShared.get(c.id, async () => {
    try {
      const entries = await database
        .select({ player: challengeEntries.player })
        .from(challengeEntries)
        .where(eq(challengeEntries.challengeId, c.id));
      let failed = false;
      const { qualified } = await resolveQualified(
        entries.map((e) => e.player),
        c.badgeIds,
        {
          walletsOf: (a) => addressesForPlayer(a),
          heldOf: async (w) => {
            const held = await onchainBadgeIdsHeld(w as Address);
            // Every entrant ran at least once, so "no badge at all" from a
            // wallet that entered is far more likely a failed read.
            if (held.length === 0) failed = true;
            return held;
          },
        },
      );
      if (failed && qualified.length === 0 && entries.length > 0) return null;
      return qualified.length;
    } catch (e) {
      log.warn("qualified count failed", {
        challengeId: c.id,
        error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
      });
      return null;
    }
  });
}
