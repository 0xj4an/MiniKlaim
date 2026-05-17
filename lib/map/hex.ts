import { cellToBoundary, gridDisk, latLngToCell } from "h3-js";
import type { Feature, FeatureCollection, Polygon, Position } from "geojson";

export type HexProperties = {
  hex: string;
  isCurrent: boolean;
};
export type HexFeature = Feature<Polygon, HexProperties>;
export type HexFeatureCollection = FeatureCollection<Polygon, HexProperties>;

export function hexesAround(
  lat: number,
  lng: number,
  resolution: number,
): { currentHex: string; hexes: HexFeatureCollection } {
  const currentHex = latLngToCell(lat, lng, resolution);
  const cells = gridDisk(currentHex, 1);

  const features: HexFeature[] = cells.map((cell) => {
    const ring = cellToBoundary(cell, true) as Position[];
    // GeoJSON Polygon rings must be closed: first === last vertex.
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push(first);
    }
    return {
      type: "Feature",
      properties: { hex: cell, isCurrent: cell === currentHex },
      geometry: { type: "Polygon", coordinates: [ring] },
    };
  });

  return {
    currentHex,
    hexes: { type: "FeatureCollection", features },
  };
}
