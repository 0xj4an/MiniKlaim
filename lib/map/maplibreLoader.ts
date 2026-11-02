"use client";

import type * as MaplibreV6 from "maplibre-gl";
import { createLogger } from "@/lib/logger";
import { mapRenderFailed } from "@/lib/map/mapTelemetry";
import type { MapTier } from "@/lib/map/tier";

const log = createLogger("maplibre");

/**
 * Which MapLibre a phone gets.
 *
 * Version 6 drops WebGL1 and throws `GPUInitializationError` from the
 * constructor without WebGL2. Measured here, that is 27 players with a map
 * that works today and 40 runs behind it. The advisory v6 closes
 * (GHSA-jrc7-96c5-q579) is not reachable in this app, both popups building
 * their nodes with `createTextNode` and `textContent` and nothing calling
 * `setHTML()`, so upgrading buys maintenance, not security, and taking those
 * maps away for it would be a bad trade.
 *
 * So both majors ship: 6 for `gl2`, 5.24 under an npm alias for `gl1`. Each
 * is loaded on demand, so a phone downloads one of them and never both.
 *
 * The cost is honest: 5.24 is the end of its line and receives no further
 * patches. The grid tier now makes a third option possible, moving `gl1` to
 * the canvas and dropping the second bundle, which is worth revisiting once
 * there is a week of data on how the grid actually reads to a player.
 */

/** Only what this app constructs. Both majors satisfy it. */
export type MaplibreModule = {
  Map: typeof MaplibreV6.Map;
  Popup: typeof MaplibreV6.Popup;
};

export const MAPLIBRE_MAJOR: Record<"gl2" | "gl1", 6 | 5> = { gl2: 6, gl1: 5 };

const cache = new Map<string, Promise<MaplibreModule>>();

/**
 * v6 is ESM only and has no default export, so it is imported by name. The
 * v5 alias keeps its default export, which is the namespace, and older
 * bundles may also expose it on `default`.
 */
async function importV6(): Promise<MaplibreModule> {
  const mod = await import("maplibre-gl");
  // With a bundler the worker is a separate chunk that v6 cannot find on its
  // own. Direct browser ESM auto-detects it, so this is guarded: calling it
  // with a bad URL would break every map rather than none.
  try {
    const workerUrl = new URL(
      "maplibre-gl/dist/maplibre-gl-worker.mjs",
      import.meta.url,
    ).href;
    mod.setWorkerUrl(workerUrl);
  } catch (e) {
    log.debug("worker url left to maplibre", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  return { Map: mod.Map, Popup: mod.Popup };
}

async function importV5(): Promise<MaplibreModule> {
  const mod = (await import("maplibre-gl-v5")) as unknown as {
    default?: MaplibreModule;
    Map?: MaplibreModule["Map"];
    Popup?: MaplibreModule["Popup"];
  };
  const ns = mod.default ?? mod;
  if (!ns.Map || !ns.Popup) throw new Error("maplibre 5 exports no Map");
  return { Map: ns.Map, Popup: ns.Popup };
}

/**
 * The module for a tier, loaded once per tier per page load. `grid` has no
 * module: that tier draws on a canvas and must never pull a map bundle,
 * which on those phones is the download and the parse that hurt most.
 */
export function loadMaplibre(tier: MapTier): Promise<MaplibreModule> | null {
  if (tier === "grid") return null;
  const key = String(MAPLIBRE_MAJOR[tier]);
  const running = cache.get(key);
  if (running) return running;

  const started = (tier === "gl1" ? importV5() : importV6()).catch((e) => {
    // A bundle that will not load is not the GPU refusing, and the tier it
    // happened on is the whole point of the report: `gl1` failing here means
    // the aliased v5 chunk is missing from the build.
    cache.delete(key);
    mapRenderFailed(tier, "maplibre", "load", "import", e);
    throw e;
  });
  cache.set(key, started);
  return started;
}

/** Test seam: forget the loaded modules. */
export function resetMaplibreCache(): void {
  cache.clear();
}
