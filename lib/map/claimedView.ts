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
  return rows.filter(
    (row) =>
      row.lat >= south &&
      row.lat <= north &&
      row.lng >= west &&
      row.lng <= east,
  );
}

export function mergeHexes(base: PlacedHex[], extra: PlacedHex[]): PlacedHex[] {
  if (extra.length === 0) return base;
  const byId = new Map(base.map((row) => [row.h3, row]));
  for (const row of extra) byId.set(row.h3, row);
  return [...byId.values()];
}
