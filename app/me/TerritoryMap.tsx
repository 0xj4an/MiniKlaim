"use client";

import { cellToLatLng, cellToParent } from "h3-js";
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
          // A player may own hexes in multiple cities (e.g. ran in Medellin
          // and Istanbul). Fitting bounds across all of them zooms out to a
          // world view that hides the actual territory. Instead, group by
          // resolution-5 parent (~city-scale) and zoom to the largest group.
          const groups = new Map<string, typeof mine>();
          for (const hex of mine) {
            const parent = cellToParent(hex.h3, 5);
            const arr = groups.get(parent) ?? [];
            arr.push(hex);
            groups.set(parent, arr);
          }
          let largest = mine;
          let largestSize = 0;
          for (const arr of groups.values()) {
            if (arr.length > largestSize) {
              largest = arr;
              largestSize = arr.length;
            }
          }
          const centroids = largest.map((hex) => cellToLatLng(hex.h3));
          const lats = centroids.map(([lat]) => lat);
          const lngs = centroids.map(([, lng]) => lng);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          // Approx span in degrees; 1 deg lat ~ 111 km. For a tight cluster
          // (< ~500 m span) fitBounds computes a near-infinite zoom and gets
          // clamped to maxZoom but maplibre also pulls back to ensure both
          // edges have padding, leaving the user at city-zoom with the hexes
          // invisible. Center + setZoom is more reliable for that case.
          const spanLat = maxLat - minLat;
          const spanLng = maxLng - minLng;
          const tight = spanLat < 0.005 && spanLng < 0.005;
          if (tight) {
            map.jumpTo({
              center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
              zoom: 16,
            });
          } else {
            map.fitBounds(
              [
                [minLng, minLat],
                [maxLng, maxLat],
              ],
              { padding: 60, maxZoom: 16, animate: false },
            );
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
