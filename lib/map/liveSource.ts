import type maplibregl from "maplibre-gl";

// MapLibre nulls `style` inside remove(). getSource/getLayer then throw
// "Cannot read properties of null". A GPS callback can still be queued.
export function liveGeoSource(
  map: maplibregl.Map,
  id: string,
): maplibregl.GeoJSONSource | null {
  try {
    const src = map.getSource(id);
    if (!src || src.type !== "geojson") return null;
    return src as maplibregl.GeoJSONSource;
  } catch {
    return null;
  }
}
