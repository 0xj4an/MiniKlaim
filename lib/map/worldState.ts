import { cellToParent } from "h3-js";
import type { ClaimedHexRow } from "@/lib/map/claimedView";
import type { WorldOwnerGroup } from "@/lib/map/worldHexes";
import type { WorldThinRes } from "@/lib/map/worldThin";

/**
 * Who owns every block, kept in memory between rebuilds of the world list.
 *
 * The list used to be rebuilt from the whole table every fifteen minutes.
 * 25 Nov 2026, 642,570 blocks: 8 to 11 s of this process's own CPU each
 * time (turning 642k rows into objects, then `cellToParent` on each), in
 * both containers, to learn about the few hundred blocks that had changed.
 * Giving Postgres sixteen times the memory that day changed nothing, which
 * is how it was told apart from a slow disk.
 *
 * A capture or a steal sets `claimed_at`, and nothing deletes a block, so
 * "what changed" is a query on that column. This keeps the answer to "who
 * owns what" and the parent cell of every block (the expensive part,
 * computed once per block instead of once per rebuild), and takes changes
 * a few rows at a time.
 *
 * Blocks are filed under their parent cell at the finest resolution the
 * world map thins to, so picking each cell's winner is a walk with no
 * maths in it.
 */
export type WorldState = {
  res: WorldThinRes;
  /** parent cell -> block -> owner. "" holds ids h3 could not parse. */
  cells: Map<string, Map<string, string>>;
  size: number;
  /** One string per owner instead of one per row (~40 bytes x 640k). */
  owners: Map<string, string>;
};

export function createWorldState(res: WorldThinRes): WorldState {
  return { res, cells: new Map(), size: 0, owners: new Map() };
}

function parentOf(h3: string, res: WorldThinRes): string {
  try {
    return cellToParent(h3, res);
  } catch {
    // A malformed id must not take the world list down. It is still listed
    // under its owner; it just never wins a dot on the map.
    return "";
  }
}

/** Record these rows. Returns how many changed anything (new, or new owner). */
export function applyRows(
  state: WorldState,
  rows: readonly Pick<ClaimedHexRow, "h3" | "owner">[],
): number {
  let changed = 0;
  for (const row of rows) {
    let owner = state.owners.get(row.owner);
    if (owner === undefined) {
      owner = row.owner;
      state.owners.set(owner, owner);
    }
    const parent = parentOf(row.h3, state.res);
    let blocks = state.cells.get(parent);
    if (!blocks) {
      blocks = new Map();
      state.cells.set(parent, blocks);
    }
    const prev = blocks.get(row.h3);
    if (prev === owner) continue;
    if (prev === undefined) state.size += 1;
    blocks.set(row.h3, owner);
    changed += 1;
  }
  return changed;
}

export type WorldView = {
  groups: Map<string, WorldOwnerGroup>;
  /** One real block per parent cell, sorted by id: see `createThinner`. */
  finest: ClaimedHexRow[];
};

/** Blocks walked before the process is handed back. */
const BREATHE_EVERY = 20_000;

/**
 * Every block grouped by owner, and each cell's winner, in one walk.
 *
 * The winner rule is `createThinner`'s, and a test holds the two to the
 * same answer: highest rank, then lowest id.
 */
export async function viewOf(
  state: WorldState,
  rank: (owner: string) => number,
  breathe: () => Promise<void>,
): Promise<WorldView> {
  const groups = new Map<string, WorldOwnerGroup>();
  const ranks = new Map<string, number>();
  const finest: ClaimedHexRow[] = [];
  let walked = 0;
  for (const [parent, blocks] of state.cells) {
    let bestH3: string | null = null;
    let bestOwner = "";
    let bestRank = -Infinity;
    for (const [h3, owner] of blocks) {
      let g = groups.get(owner);
      if (!g) {
        g = { owner, ownerUsername: null, h3: [] };
        groups.set(owner, g);
      }
      g.h3.push(h3);
      if (parent === "") continue;
      let score = ranks.get(owner);
      if (score === undefined) {
        score = rank(owner);
        ranks.set(owner, score);
      }
      if (
        score > bestRank ||
        (score === bestRank && bestH3 !== null && h3 < bestH3)
      ) {
        bestH3 = h3;
        bestOwner = owner;
        bestRank = score;
      }
    }
    if (bestH3 !== null) {
      finest.push({ h3: bestH3, owner: bestOwner, ownerUsername: null });
    }
    walked += blocks.size;
    if (walked >= BREATHE_EVERY) {
      walked = 0;
      await breathe();
    }
  }
  finest.sort((a, b) => (a.h3 < b.h3 ? -1 : a.h3 > b.h3 ? 1 : 0));
  return { groups, finest };
}
