import { breathe } from "@/lib/breathe";
import type { ClaimedHexRow } from "@/lib/map/claimedView";

/**
 * The world list grouped by owner. With ~230k claimed hexes the flat list
 * repeats each owner's address and username on every row (~24 MB of JSON);
 * grouped it is ~4 MB, which matters most for parsing on low-end phones.
 */
export type WorldOwnerGroup = {
  owner: string;
  ownerUsername: string | null;
  h3: string[];
};

export const WORLD_GROUPED_PARAM = "fmt=owners";

/** Add rows to groups being built, so a list can be grouped as it arrives. */
export function addToOwners(
  groups: Map<string, WorldOwnerGroup>,
  rows: readonly ClaimedHexRow[],
): void {
  for (const r of rows) {
    let g = groups.get(r.owner);
    if (!g) {
      g = { owner: r.owner, ownerUsername: r.ownerUsername, h3: [] };
      groups.set(r.owner, g);
    }
    g.h3.push(r.h3);
  }
}

export function groupByOwner(rows: readonly ClaimedHexRow[]): WorldOwnerGroup[] {
  const groups = new Map<string, WorldOwnerGroup>();
  addToOwners(groups, rows);
  return [...groups.values()];
}

/** How many block ids are written before the process is handed back. */
const BREATHE_EVERY_H3 = 5_000;

/**
 * The text `JSON.stringify({ owners: groups, ...tail })` would give, written
 * one owner at a time with the process handed back in between.
 *
 * One `JSON.stringify` over the whole world list is a single 135 ms hold on
 * an idle machine and three times that on a busy one. Owner by owner the
 * longest hold measured was 43 ms, and the text is byte for byte the same.
 */
export async function ownersJson(
  groups: readonly WorldOwnerGroup[],
  tail: Record<string, number> = {},
): Promise<string> {
  const parts: string[] = [];
  let written = 0;
  for (const g of groups) {
    parts.push(JSON.stringify(g));
    written += g.h3.length;
    if (written >= BREATHE_EVERY_H3) {
      written = 0;
      await breathe();
    }
  }
  const rest = Object.entries(tail)
    .map(([key, value]) => `,${JSON.stringify(key)}:${JSON.stringify(value)}`)
    .join("");
  return `{"owners":[${parts.join(",")}]${rest}}`;
}

export function expandOwners(groups: WorldOwnerGroup[]): ClaimedHexRow[] {
  const rows: ClaimedHexRow[] = [];
  for (const g of groups) {
    for (const h3 of g.h3) {
      rows.push({ h3, owner: g.owner, ownerUsername: g.ownerUsername });
    }
  }
  return rows;
}

/** Accepts either response shape, so a client and server one deploy apart still agree. */
export function rowsFromWorldResponse(
  data: { hexes?: ClaimedHexRow[]; owners?: WorldOwnerGroup[] },
): ClaimedHexRow[] {
  if (Array.isArray(data.owners)) return expandOwners(data.owners);
  return data.hexes ?? [];
}
