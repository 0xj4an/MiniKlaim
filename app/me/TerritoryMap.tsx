"use client";

import { cellToLatLng } from "h3-js";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { DEFAULT_MAP_STYLE } from "@/lib/map/config";
import { claimedHexesToFeatureCollection, frameForCells } from "@/lib/map/hex";

const log = createLogger("page:me:map");

type HexRow = { h3: string; owner: string; ownerUsername: string | null };

export function TerritoryMap({ address }: { address: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const { t } = useLocale();

  useEffect(() => {
    if (!address) return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/hexes?owner=${encodeURIComponent(address)}`,
        );
        if (!res.ok) {
          log.warn("territory hexes failed", { status: res.status });
          return;
        }
        const data = (await res.json()) as { hexes: HexRow[] };
        if (cancelled) return;
        const mine = data.hexes;
        setCount(mine.length);
        if (mine.length === 0) return;
        if (!containerRef.current) {
          await new Promise((resolve) => {
            requestAnimationFrame(() => resolve(null));
          });
        }
        if (cancelled || !containerRef.current) return;

        const owners = new Set(mine.map((h) => h.owner.toLowerCase()));
        const frame = frameForCells(
          mine.map((h) => h.h3),
          { widthPx: 320, heightPx: 240, maxZoom: 16, paddingPx: 30 },
        );
        if (!frame) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: DEFAULT_MAP_STYLE,
          center: frame.center,
          zoom: frame.zoom,
          attributionControl: { compact: true },
          interactive: true,
        });
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;
          map.resize();
          map.addSource("mine", {
            type: "geojson",
            data: claimedHexesToFeatureCollection(mine, owners),
          });
          map.addLayer({
            id: "mine-fill",
            type: "fill",
            source: "mine",
            minzoom: 11,
            paint: { "fill-color": "#10B981", "fill-opacity": 0.55 },
          });
          map.addLayer({
            id: "mine-line",
            type: "line",
            source: "mine",
            minzoom: 11,
            paint: {
              "line-color": "#10B981",
              "line-width": 1.5,
              "line-opacity": 0.95,
            },
          });

          const pointFeatures = mine.map((h) => {
            const [lat, lng] = cellToLatLng(h.h3);
            return {
              type: "Feature" as const,
              geometry: {
                type: "Point" as const,
                coordinates: [lng, lat],
              },
              properties: {},
            };
          });
          map.addSource("mine-points", {
            type: "geojson",
            data: { type: "FeatureCollection", features: pointFeatures },
          });
          map.addLayer({
            id: "mine-points",
            type: "circle",
            source: "mine-points",
            maxzoom: 13,
            paint: {
              "circle-color": "#10B981",
              "circle-opacity": 0.9,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0,
                2.5,
                4,
                4,
                8,
                6,
                12,
                5,
              ],
            },
          });
        });

        map.on("error", (e) =>
          log.error("map error", { message: e.error?.message ?? String(e) }),
        );
      } catch (e) {
        log.error("territory load failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
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
        <p className="py-8 text-center text-xs text-zinc-500">
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
