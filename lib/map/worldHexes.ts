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

export function groupByOwner(rows: ClaimedHexRow[]): WorldOwnerGroup[] {
  const groups = new Map<string, WorldOwnerGroup>();
  for (const r of rows) {
    let g = groups.get(r.owner);
    if (!g) {
      g = { owner: r.owner, ownerUsername: r.ownerUsername, h3: [] };
      groups.set(r.owner, g);
    }
    g.h3.push(r.h3);
  }
  return [...groups.values()];
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
