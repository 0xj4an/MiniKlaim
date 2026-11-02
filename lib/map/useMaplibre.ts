"use client";

import { useEffect, useState } from "react";
import { loadMaplibre, type MaplibreModule } from "@/lib/map/maplibreLoader";
import type { MapTier } from "@/lib/map/tier";

/**
 * The MapLibre a tier should use, once it has loaded.
 *
 * It returns null while loading, on the grid tier, and before the tier is
 * known. Every map effect already has to wait for the tier, so waiting for
 * the module too costs nothing and keeps those effects synchronous: making
 * a 470-line effect async to await an import would mean its cleanup could
 * run before the map it is meant to remove exists.
 */
export function useMaplibre(tier: MapTier | null): MaplibreModule | null {
  const [mod, setMod] = useState<MaplibreModule | null>(null);

  useEffect(() => {
    if (tier === null) return;
    const pending = loadMaplibre(tier);
    if (!pending) {
      setMod(null);
      return;
    }
    let alive = true;
    void pending.then(
      (loaded) => {
        if (alive) setMod(loaded);
      },
      () => {
        // loadMaplibre has already reported it. The page keeps whatever it
        // shows without a map, which is the same place a failed constructor
        // leaves it.
      },
    );
    return () => {
      alive = false;
    };
  }, [tier]);

  return mod;
}
