import { cellToLatLng, isValidCell } from "h3-js";
import { toWorld } from "@/lib/map/mercator";

/**
 * Below this zoom the run map draws dots instead of blocks.
 *
 * A block is about 16 m across. At zoom 14 that is 3 pixels, and below it a
 * block is smaller than a pixel: the polygons were still uploaded, tens of
 * thousands of them for a city, and the player saw an empty map (0xj4an,
 * 17 Nov 2026: "the blocks do not load when I zoom out").
 */
export const RUN_DOT_ZOOM = 14;

/** Pixels between dots, at the whole zoom level the bins are cut at. */
const BIN_PX = 12;

type DotRow = { h3: string; lat?: number; lng?: number };

/**
 * One row per patch of screen, for the zoomed-out run map.
 *
 * The bins are squares of the world at a whole zoom level, not of the
 * screen, so a pan never moves a dot: only crossing a zoom level regroups
 * them. Each bin keeps a real block and the dot is drawn where that block
 * is. The world map used to draw its dots at the centre of a large cell
 * instead, which put them in a lattice, off the streets and sometimes in
 * the sea.
 *
 * `rank` decides which block a bin shows (the player's run, then their own,
 * then a top-ten color). Ties go to the lowest id, so the same blocks give
 * the same dots whatever order they arrived in.
 *
 * Plain arithmetic per row, no H3 call for rows that carry their position:
 * the world list is half a million rows and this runs on every pan.
 */
export function thinForDots<T extends DotRow>(
  rows: readonly T[],
  zoom: number,
  rank: (row: T) => number,
): T[] {
  const binZoom = Math.max(0, Math.round(zoom));
  const best = new Map<number, { row: T; rank: number }>();
  // Bins across the world at this zoom, to fold x and y into one key.
  const across = Math.ceil((512 * Math.pow(2, binZoom)) / BIN_PX) + 1;
  for (const row of rows) {
    let lat = row.lat;
    let lng = row.lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      // H3 answers a malformed id with a made-up position instead of
      // refusing it, which would put a dot in the Arctic.
      if (!isValidCell(row.h3)) continue;
      [lat, lng] = cellToLatLng(row.h3);
    }
    const p = toWorld([lng, lat], binZoom);
    const key = Math.floor(p.y / BIN_PX) * across + Math.floor(p.x / BIN_PX);
    const score = rank(row);
    const prev = best.get(key);
    if (prev) {
      if (score < prev.rank) continue;
      if (score === prev.rank && row.h3 >= prev.row.h3) continue;
    }
    best.set(key, { row, rank: score });
  }
  return [...best.values()].map((entry) => entry.row);
}

/**
 * The same features as points, each on its own block.
 *
 * The properties are kept as they are, so the dot layer colors a block with
 * the expression the polygon layer uses.
 */
export function toPointCollection<P extends { hex: string }>(
  collection: GeoJSON.FeatureCollection<GeoJSON.Geometry, P>,
): GeoJSON.FeatureCollection<GeoJSON.Point, P> {
  const features: Array<GeoJSON.Feature<GeoJSON.Point, P>> = [];
  for (const feature of collection.features) {
    const [lat, lng] = cellToLatLng(feature.properties.hex);
    features.push({
      type: "Feature",
      properties: feature.properties,
      geometry: { type: "Point", coordinates: [lng, lat] },
    });
  }
  return { type: "FeatureCollection", features };
}
