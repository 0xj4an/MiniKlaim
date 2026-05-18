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

export function claimedHexesToFeatureCollection(
  rows: Array<{ h3: string; owner: string }>,
  myAddress: string | null,
): ClaimedHexFeatureCollection {
  const me = myAddress?.toLowerCase() ?? null;
  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      properties: {
        hex: row.h3,
        owner: row.owner,
        isMine: me !== null && row.owner.toLowerCase() === me,
      },
      geometry: { type: "Polygon", coordinates: [hexToPolygon(row.h3)] },
    })),
  };
}
