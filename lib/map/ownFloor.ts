import type { ClaimedHexRow } from "@/lib/map/claimedView";

/**
 * The floor under the player's own blocks: a refresh may add to what is drawn,
 * never take the player's own away.
 *
 * Every paint replaces the whole layer with one server answer. That is right
 * for other people's blocks, whose owner really can change under you, and
 * wrong for your own, because the phone already knows about those and the
 * server's silence is not evidence they are gone. Several refresh paths feed
 * the same layer (the near disk, the player's own list, the cached world, the
 * fresh world), and whenever one of them answers with a set that misses the
 * trail, the trail vanishes until another path repaints it.
 *
 * On a good connection each path finishes in about a second and nobody ever
 * sees the gap. On 0xj4an's 4G in Bandra on 5 Nov it was long enough to film:
 * the trail blinks out for a frame at 01:33 and is gone from 01:35 to 02:18,
 * while the counter sat frozen at 37 blocks. PostHog has three
 * `batch_claim_network_error` ("Load failed") across that run and **zero**
 * refresh errors, so the map was updating correctly the whole time. It was
 * drawing the truth: the server had not been told yet.
 *
 * Two holes, and this closes both.
 *
 * `pending` is the second one. Blocks captured on the phone and not yet
 * acknowledged were not merely at risk of being painted over, they were never
 * drawn at all, because the features come only from server rows and the
 * run-hex set just colours them. So the trail could only ever follow the
 * network, never the player's feet. They are drawn now, marked, so the player
 * sees their own walk immediately and a slow save is a shade rather than an
 * absence.
 */

/** A row the phone knows about but that this refresh did not mention. */
export type OwnFloorInput = {
  /** What the refresh returned. Other owners come from here and only here. */
  rows: ClaimedHexRow[];
  /** Hexes already seen to belong to the player (mineH3Ref). */
  owned: ReadonlySet<string>;
  /** Hexes captured locally and not yet acknowledged by the server. */
  pending: ReadonlySet<string>;
  /** The player's address, used as the owner of a floored or pending row. */
  address: string | null;
  /** The player's name, so a floored row labels the same as a real one. */
  username: string | null;
};

export type PaintRow = ClaimedHexRow & {
  /** Captured on this phone, not yet saved. Drawn fainter, never counted. */
  pending?: boolean;
};

/**
 * The rows to paint: the refresh's answer, plus the player's own blocks it
 * left out, plus whatever is still queued.
 *
 * Order matters and is load-bearing. The server's row for a hex always wins,
 * because it carries the real strength and the real owner: a hex the player
 * lost since the last paint must be allowed to change hands, and flooring it
 * would pin a block that is no longer theirs. The floor only fills silence.
 */
export function withOwnFloor({
  rows,
  owned,
  pending,
  address,
  username,
}: OwnFloorInput): PaintRow[] {
  if (!address) return rows;
  if (owned.size === 0 && pending.size === 0) return rows;

  const out: PaintRow[] = rows.slice();
  const seen = new Set<string>();
  for (const row of rows) seen.add(row.h3);

  for (const h3 of owned) {
    if (seen.has(h3)) continue;
    seen.add(h3);
    out.push({ h3, owner: address, ownerUsername: username });
  }

  for (const h3 of pending) {
    if (seen.has(h3)) continue;
    seen.add(h3);
    out.push({ h3, owner: address, ownerUsername: username, pending: true });
  }

  return out;
}

/**
 * Drop a hex from the local floor once the server has spoken about it.
 *
 * Without this the floor is a leak with a cost: a block the player loses to
 * someone else would be redrawn as theirs forever, which is a worse lie than
 * the flicker. `rememberOwners` already does exactly this for `owned` on
 * every paint; this is its counterpart for the pending set, called when a
 * batch comes back.
 */
export function forgetSettled(
  pending: Set<string>,
  settled: Iterable<string>,
): void {
  for (const h3 of settled) pending.delete(h3);
}
