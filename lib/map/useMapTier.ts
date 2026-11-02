"use client";

import { useEffect, useState } from "react";
import { initMapTelemetry } from "@/lib/map/mapTelemetry";
import type { MapTier } from "@/lib/map/tier";

/**
 * The tier for this page load, resolved after mount.
 *
 * It returns null on the server and on the first client render, because
 * probing a GPU needs a browser and rendering a different map on the server
 * than on the client is a hydration mismatch. Callers treat null as "not
 * decided yet" and render no map at all for that one frame, which is
 * cheaper than rendering the wrong one and swapping it.
 *
 * Resolving also stamps the tier on Sentry, so every later error in the
 * session carries it, map-related or not.
 */
export function useMapTier(): MapTier | null {
  const [tier, setTier] = useState<MapTier | null>(null);

  useEffect(() => {
    try {
      setTier(initMapTelemetry());
    } catch {
      // A probe that throws must not take the page with it. Assuming the
      // common tier keeps the map for the many; a phone that cannot build it
      // then reports a construct failure, which is already handled.
      setTier("gl2");
    }
  }, []);

  return tier;
}
