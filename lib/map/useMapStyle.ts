"use client";

import { useEffect, useState } from "react";
import type { BasemapStyle } from "@/lib/map/basemapStyle";
import { resolveMapStyle } from "@/lib/map/loadStyle";

/**
 * The basemap style for this page load, or null while it is being fetched.
 *
 * Null is handled exactly the way the map pages already handle a tier that
 * has not resolved and a MapLibre module that has not loaded: build no map
 * for that frame. The map waits on one more thing than it used to, and in
 * exchange it can no longer wait forever, because resolveMapStyle always
 * settles — with the real style, or with the no-basemap fallback once the
 * budget runs out. See lib/map/basemapStyle.
 *
 * Only the MapLibre tiers need this. The grid draws no basemap at all, so it
 * must never be gated on one.
 */
export function useMapStyle(): BasemapStyle | null {
  const [style, setStyle] = useState<BasemapStyle | null>(null);

  useEffect(() => {
    let alive = true;
    void resolveMapStyle().then((resolved) => {
      if (alive) setStyle(resolved);
    });
    return () => {
      alive = false;
    };
  }, []);

  return style;
}
