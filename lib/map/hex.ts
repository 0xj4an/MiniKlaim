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
