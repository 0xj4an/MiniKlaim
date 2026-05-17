"use client";

import maplibregl from "maplibre-gl";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { createLogger } from "@/lib/logger";
import {
  DEFAULT_CENTER,
  DEFAULT_MAP_STYLE,
  DEFAULT_ZOOM,
} from "@/lib/map/config";

const log = createLogger("page:run");

export default function RunPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    log.info("initializing map", {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    map.on("load", () => {
      log.info("map loaded");
      // Force a resize in case the container was sized after init.
      // MapLibre's internal ResizeObserver does not always catch the
      // initial mount layout pass.
      map.resize();
    });
    map.on("error", (e) =>
      log.error("map error", {
        message: e.error?.message ?? String(e),
      }),
    );

    // Also resize once on next paint as a belt-and-suspenders fix.
    const resizeTimer = window.setTimeout(() => map.resize(), 100);

    mapRef.current = map;

    return () => {
      window.clearTimeout(resizeTimer);
      log.debug("disposing map");
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div ref={containerRef} className="absolute inset-0 bg-zinc-100" />
      <Link
        href="/"
        className="absolute top-4 left-4 z-10 rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-md backdrop-blur hover:bg-white"
      >
        ← Back
      </Link>
      <div className="pointer-events-none absolute right-4 bottom-20 left-4 z-10 rounded-md bg-white/90 p-3 text-center text-xs text-zinc-700 shadow-md backdrop-blur">
        Map skeleton. Hex overlay and geolocation coming in 9.5.
      </div>
    </main>
  );
}
