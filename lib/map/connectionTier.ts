/**
 * Whether this page load should skip MapLibre because the connection cannot
 * afford it.
 *
 * MapLibre is about 290 KB of JavaScript that must arrive, parse and run
 * before a single pixel of map exists. On a good connection that is a
 * non-event. On the worst real connections it never finishes, and /run — the
 * page the whole game happens on — never opens at all. That case did not
 * improve when everything else did: slow 3G went from 34 s to 17 s, and the
 * worst 2G went from never to never.
 *
 * The grid tier already draws the hexes and the player's position on a 2D
 * canvas, with no MapLibre and no tiles. It exists for phones with no WebGL,
 * but nothing about it is specific to the GPU: it is simply the version of
 * the map that costs almost nothing to deliver. So a player arriving on a
 * connection that cannot carry MapLibre gets that one instead of getting
 * nothing.
 *
 * This is deliberately a per-load decision and is never written to the tier
 * cache. The GPU fact is durable — a phone without WebGL2 still lacks it
 * tomorrow — but the connection is a fact about right now. A player who
 * walked out of a dead spot must get the full map back on the next load, not
 * be held on the canvas for a week by something they cannot see or clear.
 */

/** The parts of navigator.connection this decision reads. */
export type ConnectionHint = {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
};

/**
 * Connections that do not get MapLibre.
 *
 * `slow-2g` and `2g` are the Network Information API's own labels for links
 * where a 290 KB download is measured in minutes. 3g is deliberately left
 * out: the throttled runs show 3g completing in 17 s, which is slow but is a
 * map, and downgrading it would take the real basemap away from a large group
 * of players who can load it.
 */
const SLOW_TYPES = new Set(["slow-2g", "2g"]);

/**
 * Below this many Mbit/s, treat the link as unable to carry MapLibre.
 *
 * 0.1 Mbit/s puts 290 KB at roughly 23 s before parsing, on top of whatever
 * the rest of the page costs. The threshold only matters on browsers that
 * report `downlink` without a useful `effectiveType`.
 */
const MIN_DOWNLINK_MBPS = 0.1;

export function isSlowConnection(hint: ConnectionHint | null): boolean {
  if (!hint) return false;
  // Data Saver is the player telling the browser to spend less of their data.
  // Honouring it is the point of the flag, and the canvas map is the cheapest
  // map we have.
  if (hint.saveData === true) return true;
  if (hint.effectiveType && SLOW_TYPES.has(hint.effectiveType)) return true;
  if (
    typeof hint.downlink === "number" &&
    Number.isFinite(hint.downlink) &&
    // A reported 0 means "unknown" on some browsers, not "no connection".
    hint.downlink > 0 &&
    hint.downlink < MIN_DOWNLINK_MBPS
  )
    return true;
  return false;
}

/**
 * Read the hint from the browser. Null on Safari and Firefox, which do not
 * implement the API at all: that is most of iOS, so this optimisation reaches
 * Chrome and Android WebView only, and every other map protection has to keep
 * working without it.
 */
export function connectionHint(): ConnectionHint | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    connection?: ConnectionHint;
    mozConnection?: ConnectionHint;
    webkitConnection?: ConnectionHint;
  };
  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  if (!conn) return null;
  return {
    effectiveType: conn.effectiveType,
    saveData: conn.saveData,
    downlink: conn.downlink,
  };
}
