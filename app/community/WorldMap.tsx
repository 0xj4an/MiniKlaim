"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import { DEFAULT_MAP_STYLE } from "@/lib/map/config";
import { claimedHexesToFeatureCollection } from "@/lib/map/hex";

const log = createLogger("page:community:map");

type HexRow = { h3: string; owner: string; ownerUsername: string | null };

export function WorldMap({ myAddress }: { myAddress: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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

    const popupRef = { current: null as maplibregl.Popup | null };
    const handleClick = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties as {
        owner: string;
        ownerUsername: string | null;
        isMine: boolean;
      };
      const fallback = `${props.owner.slice(0, 6)}...${props.owner.slice(-4)}`;
      popupRef.current?.remove();
      const el = document.createElement("div");
      el.style.fontSize = "13px";
      el.style.padding = "4px 6px";
      el.style.whiteSpace = "nowrap";
      el.appendChild(document.createTextNode("Captured by "));
      if (props.ownerUsername) {
        const link = document.createElement("a");
        link.href = `/p/${props.ownerUsername}`;
        link.textContent = `@${props.ownerUsername}`;
        link.style.color = "#FF6B35";
        link.style.textDecoration = "underline";
        el.appendChild(link);
      } else {
        el.appendChild(document.createTextNode(fallback));
      }
      if (props.isMine) {
        el.appendChild(document.createTextNode(" (you)"));
      }
      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
      })
        .setLngLat(e.lngLat)
        .setDOMContent(el)
        .addTo(map);
    };

    map.on("load", async () => {
      map.resize();
      try {
        const res = await fetch("/api/hexes");
        const data = (await res.json()) as { hexes: HexRow[] };
        if (cancelled) return;
        setCount(data.hexes.length);

        const me = myAddress?.toLowerCase() ?? null;
        const mine = me
          ? data.hexes.filter((h) => h.owner.toLowerCase() === me)
          : [];
        const others = me
          ? data.hexes.filter((h) => h.owner.toLowerCase() !== me)
          : data.hexes;

        map.addSource("others", {
          type: "geojson",
          data: claimedHexesToFeatureCollection(others, myAddress ?? ""),
        });
        map.addLayer({
          id: "others-fill",
          type: "fill",
          source: "others",
          paint: { "fill-color": "#FF6B35", "fill-opacity": 0.45 },
        });
        map.addLayer({
          id: "others-line",
          type: "line",
          source: "others",
          paint: {
            "line-color": "#FF6B35",
            "line-width": 1,
            "line-opacity": 0.85,
          },
        });

        if (mine.length > 0) {
          map.addSource("mine", {
            type: "geojson",
            data: claimedHexesToFeatureCollection(mine, myAddress ?? ""),
          });
          map.addLayer({
            id: "mine-fill",
            type: "fill",
            source: "mine",
            paint: { "fill-color": "#10B981", "fill-opacity": 0.6 },
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
          map.on("click", "mine-fill", handleClick);
          map.on("mouseenter", "mine-fill", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "mine-fill", () => {
            map.getCanvas().style.cursor = "";
          });
        }

        map.on("click", "others-fill", handleClick);
        map.on("mouseenter", "others-fill", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "others-fill", () => {
          map.getCanvas().style.cursor = "";
        });

        if (data.hexes.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          for (const hex of data.hexes) {
            const fc = claimedHexesToFeatureCollection([hex], "");
            const coords = fc.features[0]?.geometry.coordinates[0] ?? [];
            for (const [lng, lat] of coords) {
              bounds.extend([lng, lat]);
            }
          }
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 40, maxZoom: 12, animate: false });
          }
        }
      } catch (e) {
        log.error("world map load failed", {
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
  }, [myAddress]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="text-center text-xs text-zinc-500">
        World map{count !== null ? ` (${count} captured)` : ""}
      </p>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          height: 320,
          borderRadius: 6,
          overflow: "hidden",
          backgroundColor: "#f4f4f5",
        }}
      />
    </div>
  );
}
