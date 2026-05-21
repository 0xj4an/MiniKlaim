"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { DEFAULT_MAP_STYLE } from "@/lib/map/config";
import { claimedHexesToFeatureCollection } from "@/lib/map/hex";

const log = createLogger("page:me:map");

type HexRow = { h3: string; owner: string; ownerUsername: string | null };

export function TerritoryMap({ address }: { address: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const { t } = useLocale();

  useEffect(() => {
    if (!containerRef.current) return;
    if (!address) return;
    const lower = address.toLowerCase();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_MAP_STYLE,
      center: [0, 20],
      zoom: 1,
      attributionControl: { compact: true },
      interactive: true,
    });
    mapRef.current = map;

    let cancelled = false;

    map.on("load", async () => {
      map.resize();
      try {
        const res = await fetch("/api/hexes");
        const data = (await res.json()) as { hexes: HexRow[] };
        const mine = data.hexes.filter((h) => h.owner.toLowerCase() === lower);
        if (cancelled) return;
        setCount(mine.length);

        map.addSource("mine", {
          type: "geojson",
          data: claimedHexesToFeatureCollection(mine, address),
        });
        map.addLayer({
          id: "mine-fill",
          type: "fill",
          source: "mine",
          paint: { "fill-color": "#10B981", "fill-opacity": 0.55 },
        });
        map.addLayer({
          id: "mine-line",
          type: "line",
          source: "mine",
          paint: {
            "line-color": "#10B981",
            "line-width": 1.5,
            "line-opacity": 0.95,
          },
        });

        if (mine.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          for (const hex of mine) {
            const fc = claimedHexesToFeatureCollection([hex], address);
            const coords = fc.features[0]?.geometry.coordinates[0] ?? [];
            for (const [lng, lat] of coords) {
              bounds.extend([lng, lat]);
            }
          }
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 40, maxZoom: 16, animate: false });
          }
        }
      } catch (e) {
        log.error("territory load failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });

    map.on("error", (e) =>
      log.error("map error", { message: e.error?.message ?? String(e) }),
    );

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [address]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="text-center text-xs text-zinc-500">
        {t("me.territory.header")}
        {count !== null ? ` (${count})` : ""}
      </p>
      {count === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-400">
          {t("me.territory.empty")}
        </p>
      ) : (
        <div
          ref={containerRef}
          style={{
            position: "relative",
            height: 240,
            borderRadius: 6,
            overflow: "hidden",
            backgroundColor: "#f4f4f5",
          }}
        />
      )}
    </div>
  );
}
