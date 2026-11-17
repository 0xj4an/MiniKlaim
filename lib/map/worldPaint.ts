import { cellToParent } from "h3-js";
import type { ClaimedHexRow } from "@/lib/map/claimedView";

/** Polygon fills start here. Below it the world is dots, one per parent cell. */
export const WORLD_FILL_ZOOM = 8;

/** Polygons uploaded for one screen. Past this the dots stay and the fills wait. */
export const WORLD_POLYGON_CAP = 3000;

/**
 * Parent resolution for the world dots. Null means the real blocks, clipped
 * to the screen. A world view of every block is what killed the community
 * tab: hundreds of thousands of polygons uploaded while the camera still
 * showed the whole planet.
 */
export function worldPointParentRes(zoom: number): number | null {
  if (zoom >= WORLD_FILL_ZOOM) return null;
  if (zoom < 3) return 2;
  if (zoom < 6) return 3;
  return 4;
}

/**
 * One row per parent cell. The player's own block wins the cell, then a
 * top-10 block, so those colors survive the thinning.
 *
 * `place` says what the row stands for. "block" keeps the id of the real
 * block that won, for a dot drawn where somebody captured (see
 * lib/map/worldThin for why the cell centre was wrong). "cell" returns the
 * parent, for the grid tier, which draws the cell itself as a shape.
 *
 * Ties go to the lowest id, so the same list always thins the same way.
 */
export function thinWorldRows(
  rows: readonly ClaimedHexRow[],
  parentRes: number,
  rank: (owner: string) => number,
  place: "cell" | "block" = "cell",
): ClaimedHexRow[] {
  const best = new Map<string, { row: ClaimedHexRow; rank: number }>();
  for (const row of rows) {
    let parent: string;
    try {
      parent = cellToParent(row.h3, parentRes);
    } catch {
      continue;
    }
    const score = rank(row.owner);
    const prev = best.get(parent);
    if (prev) {
      if (score < prev.rank) continue;
      if (score === prev.rank && row.h3 >= prev.row.h3) continue;
    }
    best.set(parent, { rank: score, row });
  }
  return [...best.entries()].map(([parent, entry]) => ({
    h3: place === "cell" ? parent : entry.row.h3,
    owner: entry.row.owner,
    ownerUsername: entry.row.ownerUsername,
  }));
}
