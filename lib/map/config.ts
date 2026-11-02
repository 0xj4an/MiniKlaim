// World origin. A missing GPS fix must not open on a real city, or the
// player thinks the game only exists there.
export const DEFAULT_CENTER: [number, number] = [0, 0];
export const DEFAULT_ZOOM = 14;
export const FOLLOW_ZOOM = 17; // zoom level when centered on user position

/**
 * How far out the run map lets a player pinch.
 *
 * This was 13, on the grounds that low-zoom tiles are enormous. Measured
 * against the real tile host over Medellin, one tile:
 *
 *   z14 261 KB · z13 163 KB · z12 172 KB · z11 76 KB · z10 77 KB
 *   z9 127 KB · z8 111 KB · z6 183 KB · z4 315 KB · z2 1,267 KB
 *
 * So the expensive tiles are not where the limit was put. Zooming out to 10
 * or 11 is *cheaper* per tile than the zoom players were locked at, and a
 * screen holds roughly the same number of tiles at any zoom, so the bytes
 * per screen go down too. The real cliff is below 6, and z2 at 1.2 MB is
 * the one worth refusing: a pinch to the whole world, or a camera animation
 * that dips through it, is what costs a phone real data.
 *
 * 10 is about 40 km across on a phone, which is the city and the way out of
 * it. The floor stays, so the cliff is still out of reach.
 */
export const RUN_MIN_ZOOM = 10;

/**
 * H3 resolution for the claimable hex grid. Resolution 12 is about 9-10 m
 * edge length (about 300 m2 per hex, centres about 16 m apart), the right
 * scale for "claim this block by running through it".
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

/**
 * Keep MapLibre's GPU and tile memory small on low-end phones. One player's
 * phone ran out of memory ("Array buffer allocation failed") on /run, /me
 * and /community on 12 Oct. A 3x screen renders 9x the pixels of 1x; 2x is
 * still sharp, and a 40-tile cache is plenty for a walking-speed map.
 */
export function lightMapOptions(): {
  pixelRatio: number;
  maxTileCacheSize: number;
} {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return { pixelRatio: Math.min(dpr, 2), maxTileCacheSize: 40 };
}
