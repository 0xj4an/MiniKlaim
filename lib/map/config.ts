export const DEFAULT_CENTER: [number, number] = [-74.0721, 4.711]; // Bogota, [lng, lat]
export const DEFAULT_ZOOM = 14;
export const FOLLOW_ZOOM = 17; // zoom level when centered on user position

/**
 * H3 resolution for the claimable hex grid. Resolution 12 gives ~50m edge
 * length, the right scale for "claim this block by running through it".
 * See https://h3geo.org/docs/core-library/restable.
 */
export const HEX_RESOLUTION = 12;

/**
 * OpenFreeMap Positron vector basemap. Free, no API key, hosted on Cloudflare.
 * Vector tiles keep bandwidth low on MiniPay mobile clients. Visually close to
 * the old CARTO Positron look (light, minimal, road-oriented) that we used
 * before CARTO started stamping "API KEY REQUIRED" on its unauthenticated
 * basemap CDN. Attribution (OSM + OpenFreeMap) is baked into the style JSON.
 */
export const DEFAULT_MAP_STYLE =
  "https://tiles.openfreemap.org/styles/positron";
