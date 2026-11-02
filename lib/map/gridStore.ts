"use client";

import type { ClaimedHexFeatureCollection } from "@/lib/map/hex";
import type { LngLat } from "@/lib/map/mercator";

/**
 * What the grid map is currently showing, held outside React.
 *
 * The run page pushes a new position roughly once a second, and it is a large
 * component. Routing that through its own state would re-render the whole
 * tree on every fix, on the slowest phones in the population, to move one
 * dot. So the grid's data lives here and only the canvas subscribes.
 *
 * This is also what keeps the grid tier out of the run page's render path
 * entirely: the page writes, the canvas reads, and nothing else is aware.
 */
export type GridData = {
  hexes: ClaimedHexFeatureCollection;
  center: LngLat;
  zoom: number;
  position: LngLat | null;
  /**
   * The canvas size in CSS pixels, written by the canvas as it paints. The
   * claimed-block fetch needs it to work out what the view covers, and on
   * this tier there is no map object to ask.
   */
  size: { width: number; height: number };
};

const EMPTY: GridData = {
  hexes: { type: "FeatureCollection", features: [] },
  center: [0, 0],
  zoom: 16,
  position: null,
  size: { width: 360, height: 640 },
};

let state: GridData = EMPTY;
const listeners = new Set<() => void>();

export function getGridData(): GridData {
  return state;
}

export function setGridData(patch: Partial<GridData>): void {
  // A new object every time, because the canvas effect compares by identity.
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeGrid(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Drop everything on leaving a map surface, so the next one starts clean. */
export function resetGridData(): void {
  state = EMPTY;
  for (const listener of listeners) listener();
}
