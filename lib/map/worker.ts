"use client";

import * as maplibregl from "maplibre-gl";

/**
 * MapLibre 6 is ESM-only and loads its tile worker as a separate module.
 * Loaded straight from a browser it finds the worker itself, but behind a
 * bundler it cannot, and every map comes up with "Worker failed to load.
 * Check that the worker URL is correct." — the canvas paints, no error
 * reaches React, and no tile ever arrives, so the map is simply blank.
 *
 * `new URL(..., import.meta.url)` is what Turbopack and webpack understand as
 * an asset reference, so the worker is emitted and fingerprinted like any
 * other chunk. Must run before the first Map is constructed; calling it more
 * than once is harmless but pointless, hence the flag.
 */
let done = false;

export function ensureMapWorker(): void {
  if (done || typeof window === "undefined") return;
  done = true;
  maplibregl.setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString(),
  );
}
