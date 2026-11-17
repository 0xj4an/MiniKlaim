import { cellToLatLng } from "h3-js";
import { haversineMeters } from "@/lib/map/geo";

// Res-12 hex centers are about 16.3m apart. A disk of k rings is the walk
// view. Past the API cap the city is wider than that disk, so the run map
// has to use the full claimed set and clip it to the screen.
const CENTER_M = 16.3;
export const MAX_HEX_DISK = 60;

export type ClaimedHexRow = {
  h3: string;
  owner: string;
  ownerUsername: string | null;
  /** Block level 1-10 (hex strength). Only on the run-map and own lists. */
  strength?: number;
};

export type PlacedHex = ClaimedHexRow & { lat: number; lng: number };

export type LngLatBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export function diskKForRadius(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return 1;
  return Math.min(MAX_HEX_DISK, Math.ceil(radiusMeters / CENTER_M) + 1);
}

export function viewportNeedsWorld(radiusMeters: number): boolean {
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return false;
  return Math.ceil(radiusMeters / CENTER_M) + 1 > MAX_HEX_DISK;
}

/**
 * Why a refresh of the run map was asked for.
 *
 * "fresh" is a new screen: the page loaded, the wallet changed, a run
 * started or ended. "move" is the player panning or zooming. "claimed" is
 * the server having just answered a batch of this run.
 */
export type RefreshReason = "move" | "fresh" | "claimed";

/** How old the player's own block list may get before it is asked for again. */
export const OWN_LIST_MAX_AGE_MS = 10 * 60_000;

/**
 * How old the world list may get on the run screen. It is 1.2 MB and it
 * changes every minute, so the ETag never saves the download. The blocks
 * near the player and the player's own come from elsewhere and stay current.
 */
export const RUN_WORLD_MAX_AGE_MS = 30 * 60_000;

/**
 * Whether a zoomed-out refresh should download the player's whole block list.
 *
 * It used to, after every batch the server accepted, and on every pan when
 * the phone had no world list saved. The list is 60 to 120 KB for a regular
 * player and a batch lands every few seconds in a car: on 14 Nov 2026 one
 * phone asked for it 1,312 times in two drives, about 100 MB of mobile data.
 * Nothing in the answer was news. What the batch changed is already on the
 * phone (the claim response says, block by block, who owns it now and at
 * what level), and the map never takes one of the player's blocks away on
 * its own (lib/map/ownFloor).
 */
export function shouldFetchOwnList(params: {
  reason: RefreshReason;
  /** A world list is on the phone, from this session or from storage. */
  haveWorld: boolean;
  /** Milliseconds since the own list last arrived; Infinity when it never has. */
  ownAgeMs: number;
}): boolean {
  if (params.reason === "fresh") return true;
  const stale = !(params.ownAgeMs < OWN_LIST_MAX_AGE_MS);
  if (params.reason === "claimed") return stale;
  // A pan with nothing to draw from: the player's own blocks are the part
  // they notice missing, so fetch them, once.
  return !params.haveWorld && stale;
}

export function diskRadiusMeters(k: number): number {
  return Math.max(0, k - 1) * CENTER_M;
}

export function diskCoversView(
  anchorLat: number,
  anchorLng: number,
  loadedRadiusM: number,
  centerLat: number,
  centerLng: number,
  viewRadiusM: number,
): boolean {
  const moved = haversineMeters(anchorLat, anchorLng, centerLat, centerLng);
  return moved + viewRadiusM <= loadedRadiusM;
}

/** Remember which painted hexes belong to this player, and forget a hex
 *  whose owner is now someone else. */
export function rememberOwners(
  owned: Set<string>,
  rows: ClaimedHexRow[],
  playerAddresses: ReadonlySet<string>,
): void {
  for (const row of rows) {
    if (!row.h3 || !row.owner) continue;
    if (playerAddresses.has(row.owner.toLowerCase())) owned.add(row.h3);
    else owned.delete(row.h3);
  }
}

/** What the server just said about one block, in answer to a claim. */
export type RowChange = {
  /** Set when the block now belongs to the player. Absent for an attack. */
  owner?: string;
  ownerUsername?: string | null;
  /** The level the block was left at. */
  strength?: number;
};

/**
 * Write a claim's answer into rows the phone already holds.
 *
 * This is what lets the run map stop downloading the player's whole list
 * after every batch. Without it the saved rows would still name the old
 * owner of a block the player just stole, and `rememberOwners` would take
 * that as the server saying it changed hands and give it back.
 *
 * A block the rows do not have yet is added when the player owns it now. An
 * attack on a block the rows do not have is dropped: there is no owner to
 * draw it with, and the next refresh brings it.
 */
export function patchRows<T extends ClaimedHexRow>(
  rows: T[],
  changes: ReadonlyMap<string, RowChange>,
  place: (row: ClaimedHexRow) => T,
): T[] {
  if (changes.size === 0) return rows;
  const seen = new Set<string>();
  const out = rows.map((row) => {
    const change = changes.get(row.h3);
    if (!change) return row;
    seen.add(row.h3);
    return {
      ...row,
      ...(change.owner
        ? { owner: change.owner, ownerUsername: change.ownerUsername ?? null }
        : {}),
      ...(typeof change.strength === "number"
        ? { strength: change.strength }
        : {}),
    };
  });
  for (const [h3, change] of changes) {
    if (seen.has(h3) || !change.owner) continue;
    out.push(
      place({
        h3,
        owner: change.owner,
        ownerUsername: change.ownerUsername ?? null,
        ...(typeof change.strength === "number"
          ? { strength: change.strength }
          : {}),
      }),
    );
  }
  return out;
}

export function placeHexes(rows: ClaimedHexRow[]): PlacedHex[] {
  return rows.map((row) => {
    const [lat, lng] = cellToLatLng(row.h3);
    return { ...row, lat, lng };
  });
}

export function hexesInBounds(
  rows: PlacedHex[],
  bounds: LngLatBounds,
  padMeters = 40,
): PlacedHex[] {
  const midLat = (bounds.south + bounds.north) / 2;
  const dLat = padMeters / 111320;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const dLng = padMeters / (111320 * Math.max(0.2, Math.abs(cos)));
  const west = bounds.west - dLng;
  const east = bounds.east + dLng;
  const south = bounds.south - dLat;
  const north = bounds.north + dLat;
  // Zoomed out far enough, the view runs past the edge of the world and its
  // bounds leave -180..180: a view centred on the Pacific reports west as
  // 150 and east as 210. A block is in view when any copy of it is.
  const everyLng = east - west >= 360;
  return rows.filter(
    (row) =>
      row.lat >= south &&
      row.lat <= north &&
      (everyLng ||
        (row.lng >= west && row.lng <= east) ||
        (row.lng + 360 >= west && row.lng + 360 <= east) ||
        (row.lng - 360 >= west && row.lng - 360 <= east)),
  );
}

export function mergeHexes(base: PlacedHex[], extra: PlacedHex[]): PlacedHex[] {
  if (extra.length === 0) return base;
  const byId = new Map(base.map((row) => [row.h3, row]));
  for (const row of extra) byId.set(row.h3, row);
  return [...byId.values()];
}
