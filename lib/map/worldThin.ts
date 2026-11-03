import { cellToParent } from "h3-js";
import type { ClaimedHexRow } from "@/lib/map/claimedView";

/**
 * The resolutions the world view is allowed to ask the server for.
 *
 * These are the same three `worldPointParentRes` picks by zoom. Anything
 * else is refused rather than computed, so a client cannot ask the server
 * to group 300k blocks at a resolution nobody draws.
 */
export const WORLD_THIN_RES = [2, 3, 4] as const;
export type WorldThinRes = (typeof WORLD_THIN_RES)[number];

export function parseThinRes(raw: string | null): WorldThinRes | null {
  if (raw === null) return null;
  const n = Number(raw);
  return (WORLD_THIN_RES as readonly number[]).includes(n)
    ? (n as WorldThinRes)
    : null;
}

/**
 * One row per parent cell, preferring the owner the map most wants to show.
 *
 * This is the thinning the browser has been doing since the world view
 * existed, moved to the server. The point is not the CPU: it is that the
 * browser could only thin a list it had already downloaded, so every visit
 * to /community pulled all 303,000 blocks, 5.8 MB raw and ~1 MB on the
 * wire, to draw roughly two thousand dots. In four days the proxy logged
 * 12,204 "aborting with incomplete response": clients dropping mid
 * download, mostly on mobile data.
 *
 * `rank` keeps the colours that carry meaning. A top-ten player's block
 * wins its cell over an anonymous one, because the ten colours on that map
 * are the only thing distinguishing it from a grey smear. Ties go to the
 * lowest h3 id, so two servers, or the same server twice, thin the same way
 * and the ETag stays stable.
 */
export function thinToParents(
  rows: readonly ClaimedHexRow[],
  res: WorldThinRes,
  rank: (owner: string) => number,
): ClaimedHexRow[] {
  // `child` is the id this cell was won with. The row's own h3 is already
  // the parent by then, so comparing against it would compare a child to a
  // parent and the tie-break would depend on arrival order.
  const best = new Map<
    string,
    { row: ClaimedHexRow; rank: number; child: string }
  >();
  for (const row of rows) {
    let parent: string;
    try {
      parent = cellToParent(row.h3, res);
    } catch {
      // A malformed id in the table must not take the whole world list down.
      continue;
    }
    const score = rank(row.owner);
    const prev = best.get(parent);
    if (prev) {
      if (score < prev.rank) continue;
      // Same rank: the lowest id wins, so the output is deterministic and
      // the ETag does not change just because the rows came back in
      // another order.
      if (score === prev.rank && row.h3 >= prev.child) continue;
    }
    best.set(parent, {
      rank: score,
      child: row.h3,
      row: { h3: parent, owner: row.owner, ownerUsername: row.ownerUsername },
    });
  }
  // Sorted for the same reason: a stable body means a stable ETag, and a
  // phone that already has this copy gets a 304 instead of a megabyte.
  return [...best.values()]
    .map((e) => e.row)
    .sort((a, b) => (a.h3 < b.h3 ? -1 : a.h3 > b.h3 ? 1 : 0));
}
