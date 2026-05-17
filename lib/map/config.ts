import type { StyleSpecification } from "maplibre-gl";

export const DEFAULT_CENTER: [number, number] = [-74.0721, 4.711]; // Bogota, [lng, lat]
export const DEFAULT_ZOOM = 14;

/**
 * CARTO Light raster basemap. Free, no API key. Reliable for dev.
 * OSM's own tile servers (tile.openstreetmap.org) block heavy/local
 * use with an `x-blocked` header, so we use CARTO's CDN which is
 * intended for application use under their attribution policy.
 *
 * Switch to a vector style (OpenFreeMap, MapTiler) when we want
 * richer styling or lower bandwidth.
 */
export const DEFAULT_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "carto",
      type: "raster",
      source: "carto",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};
