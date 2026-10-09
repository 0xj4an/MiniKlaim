// World origin. A missing GPS fix must not open on a real city, or the
// player thinks the game only exists there.
export const DEFAULT_CENTER: [number, number] = [0, 0];
export const DEFAULT_ZOOM = 14;
export const FOLLOW_ZOOM = 17; // zoom level when centered on user position

// The run map stays at city zoom. OpenFreeMap zoom-2 tiles are about 1.5MB
// each, so a pinch-out to the world (or a flyTo that dips through it) is
// hundreds of MB on a phone. 13 is still a few kilometers of city.
export const RUN_MIN_ZOOM = 13;

/**
 * H3 resolution for the claimable hex grid. Resolution 12 gives ~50m edge
 * length, the right scale for "claim this block by running through it".
 * See https://h3geo.org/docs/core-library/restable.
 */
export const HEX_RESOLUTION = 12;

/**
 * OpenFreeMap Positron vector basemap. Free, no API key, hosted on Cloudflare.
 * City-zoom tiles are a few hundred KB. Zoom-2 tiles are about 1.5MB, so the
 * run map must not fly through them. Visually close to the old CARTO Positron
 * look (light, minimal, road-oriented) that we used before CARTO started
 * stamping "API KEY REQUIRED" on its unauthenticated basemap CDN. Attribution
 * (OSM + OpenFreeMap) is baked into the style JSON.
 */
export const DEFAULT_MAP_STYLE =
  "https://tiles.openfreemap.org/styles/positron";
