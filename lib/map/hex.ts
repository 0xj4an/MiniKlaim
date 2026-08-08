import { cellToBoundary, gridDisk, latLngToCell } from "h3-js";
import type { Feature, FeatureCollection, Polygon, Position } from "geojson";

export type HexProperties = {
  hex: string;
  isCurrent: boolean;
};
export type HexFeature = Feature<Polygon, HexProperties>;
export type HexFeatureCollection = FeatureCollection<Polygon, HexProperties>;

export type ClaimedHexProperties = {
  hex: string;
  owner: string;
  ownerUsername: string | null;
  isMine: boolean;
};
export type ClaimedHexFeature = Feature<Polygon, ClaimedHexProperties>;
export type ClaimedHexFeatureCollection = FeatureCollection<
  Polygon,
  ClaimedHexProperties
>;

function hexToPolygon(cell: string): Position[] {
  const ring = cellToBoundary(cell, true) as Position[];
  // GeoJSON Polygon rings must be closed: first === last vertex.
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push(first);
  }
  return ring;
}

export function hexesAround(
  lat: number,
  lng: number,
  resolution: number,
): { currentHex: string; hexes: HexFeatureCollection } {
  const currentHex = latLngToCell(lat, lng, resolution);
  const cells = gridDisk(currentHex, 1);

  const features: HexFeature[] = cells.map((cell) => ({
    type: "Feature",
    properties: { hex: cell, isCurrent: cell === currentHex },
    geometry: { type: "Polygon", coordinates: [hexToPolygon(cell)] },
  }));

  return {
    currentHex,
    hexes: { type: "FeatureCollection", features },
  };
}

/**
 * Walk the straight line from (fromLat, fromLng) to (toLat, toLng) sampling
 * every ~stepMeters and return the ordered list of distinct H3 cells the path
 * crosses, INCLUDING the endpoint cell but EXCLUDING the start cell (the
 * caller already claimed that one on the previous GPS fix). Used to recover
 * hexes that were physically traversed between two GPS pings when the player
 * moves faster than 1 hex per ping — critical for fast running, biking, cars,
 * and vehicles in general.
 *
 * Linear interpolation in lat/lng is fine at any realistic per-segment scale
 * (up to hundreds of meters). Great-circle deviation would matter at
 * intercontinental scale, but by then the segment is dominated by a genuine
 * GPS teleport bug the server rejects anyway.
 *
 * Caps at 500 samples per segment as a runaway guard (2.5km at 5m step); the
 * server's `DISTANCE_MAX_PER_CAPTURE` rejects anything crazier per hex.
 */
export function interpolateHexIds(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  resolution: number,
  stepMeters = 5,
): string[] {
  // Approximate meters per degree at this latitude for step count.
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos((fromLat * Math.PI) / 180);
  const dLat = (toLat - fromLat) * metersPerDegLat;
  const dLng = (toLng - fromLng) * metersPerDegLng;
  const distMeters = Math.sqrt(dLat * dLat + dLng * dLng);

  if (distMeters < stepMeters) {
    const endCell = latLngToCell(toLat, toLng, resolution);
    const startCell = latLngToCell(fromLat, fromLng, resolution);
    return endCell === startCell ? [] : [endCell];
  }

  const rawSteps = Math.ceil(distMeters / stepMeters);
  const steps = Math.min(rawSteps, 500);
  const startCell = latLngToCell(fromLat, fromLng, resolution);
  const out: string[] = [];
  const seen = new Set<string>([startCell]);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const lat = fromLat + (toLat - fromLat) * t;
    const lng = fromLng + (toLng - fromLng) * t;
    const cell = latLngToCell(lat, lng, resolution);
    if (seen.has(cell)) continue;
    seen.add(cell);
    out.push(cell);
  }
  return out;
}

/**
 * Build a feature collection colored by ownership.
 *
 * `myAddresses` is the SET of addresses the current player owns across every
 * linked wallet, all lowercase. A hex is "mine" when its owner (also
 * lowercased for the check) is in the set. Callers who don't need the "mine"
 * distinction (e.g. rendering a popup for one hex) can pass an empty set.
 */
export function claimedHexesToFeatureCollection(
  rows: Array<{ h3: string; owner: string; ownerUsername?: string | null }>,
  myAddresses: ReadonlySet<string>,
): ClaimedHexFeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      properties: {
        hex: row.h3,
        owner: row.owner,
        ownerUsername: row.ownerUsername ?? null,
        isMine: myAddresses.has(row.owner.toLowerCase()),
      },
      geometry: { type: "Polygon", coordinates: [hexToPolygon(row.h3)] },
    })),
  };
}
