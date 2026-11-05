/**
 * The basemap style, and what the map falls back to when it cannot be had.
 *
 * The style JSON is the one file MapLibre must have before it draws anything
 * at all: no style, no map, not even a blank one with the player's own blocks
 * on it. Ours came straight from tiles.openfreemap.org, a free third party, so
 * every map on every page had a hard dependency on someone else's uptime on
 * the critical path. When that host was slow or unreachable the map did not
 * degrade, it died: a white rectangle and a player who concludes the app is
 * broken. Between 8 and 27 players a day hit exactly that, and it is the most
 * likely explanation for 0xj4an's own "no me quiso cargar el mapa" on an
 * iPhone on 4G.
 *
 * Two changes come out of that. The style is fetched from our own origin,
 * which caches it and keeps serving the last good copy when upstream is down.
 * And if even that fails, the map is built from FALLBACK_STYLE instead of not
 * being built: no streets, but the hexes, the position marker and the run all
 * work. Losing the background is a worse map. Losing the map is a broken app.
 */

import type { StyleSpecification } from "maplibre-gl";

/** Where the real style comes from. Fetched server-side, never by the phone. */
export const UPSTREAM_STYLE_URL =
  "https://tiles.openfreemap.org/styles/positron";

/** Our own origin, which is what the phone asks for. */
export const STYLE_URL = "/api/map/style";

/**
 * How long the phone waits for a style before giving up and drawing without
 * a background.
 *
 * On the throttled runs a map on slow 3G was interactive inside 2 s, so five
 * seconds is already several times the normal case and is not a budget a
 * working connection runs into. The point is to have any budget at all: the
 * previous behaviour was MapLibre's own, which is to wait as long as the
 * request takes, and on the connection that produced the complaint that is
 * forever.
 */
export const STYLE_TIMEOUT_MS = 5_000;

/**
 * MapLibre's own style type. Type-only, so neither this module nor the API
 * route that imports it pulls a byte of MapLibre into a bundle, and the
 * fallback below cannot drift from what the constructor actually accepts.
 */
export type BasemapStyle = StyleSpecification;

/**
 * A valid style with no tile sources: the same light grey the map containers
 * already use as their background, so a map that falls back to this reads as
 * a plain backdrop rather than as a failure.
 */
export const FALLBACK_STYLE: BasemapStyle = {
  version: 8,
  // An empty glyph/sprite set, so a layer that asks for either fails to draw
  // rather than throwing.
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#f4f4f5" },
    },
  ],
};

/**
 * Whether a parsed style is one MapLibre can actually build a map from.
 *
 * Upstream returning 200 with an error page, a truncated body, or a future
 * style version are all ways to get JSON that is not a style, and handing
 * one of those to the constructor throws on exactly the phones least able to
 * recover. Checked here so both the server cache and the client agree on what
 * counts as usable, and so the answer is testable without a browser.
 */
export function isUsableStyle(value: unknown): value is BasemapStyle {
  if (!value || typeof value !== "object") return false;
  const style = value as Partial<BasemapStyle>;
  if (style.version !== 8) return false;
  if (!Array.isArray(style.layers) || style.layers.length === 0) return false;
  if (!style.sources || typeof style.sources !== "object") return false;
  return style.layers.every(
    (l) => !!l && typeof l === "object" && typeof l.id === "string",
  );
}
