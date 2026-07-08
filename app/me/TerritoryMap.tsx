"use client";

import { cellToLatLng } from "h3-js";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { DEFAULT_MAP_STYLE } from "@/lib/map/config";
import { claimedHexesToFeatureCollection } from "@/lib/map/hex";
import { useLinkedAddresses } from "@/lib/wallet/useLinkedAddresses";

const log = createLogger("page:me:map");

type HexRow = { h3: string; owner: string; ownerUsername: string | null };

export function TerritoryMap({ address }: { address: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const { t } = useLocale();
  // Includes the connected wallet plus every linked wallet on this player.
  // Loads asynchronously; defaults to {connected} while pending, so pre-link
  // users see no difference in timing.
  const linked = useLinkedAddresses(address, address !== null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!address) return;

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
        const mine = data.hexes.filter((h) =>
          linked.has(h.owner.toLowerCase()),
        );
        if (cancelled) return;
        setCount(mine.length);

        // Hex polygons are at H3 res 12 (~50m edge), invisible below city
        // zoom. Render them as filled hexes when zoomed in (>= 11), and as
        // dots when zoomed out so the territory is always visible even at
        // country/world scale.
        map.addSource("mine", {
          type: "geojson",
          data: claimedHexesToFeatureCollection(mine, linked),
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

        if (mine.length > 0) {
          // Fit bounds to every owned hex so all territory is visible at
          // first paint. Users with runs in multiple cities will see a
          // country/world-scale view rendered as dots (via the points layer
          // above); the fill layer kicks in when they zoom to city scale.
          const centroids = mine.map((hex) => cellToLatLng(hex.h3));
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
              { padding: 30, maxZoom: 15, animate: false },
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
  }, [address, linked]);

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
