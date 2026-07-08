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

type HexFeatureProps = {
  owner: string;
  ownerUsername: string | null;
  isMine: boolean;
};

function hexesToPointCollection(
  rows: HexRow[],
  myAddresses: ReadonlySet<string>,
): GeoJSON.FeatureCollection<GeoJSON.Point, HexFeatureProps> {
  return {
    type: "FeatureCollection",
    features: rows.map((h) => {
      const [lat, lng] = cellToLatLng(h.h3);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {
          owner: h.owner,
          ownerUsername: h.ownerUsername,
          isMine: myAddresses.has(h.owner.toLowerCase()),
        },
      };
    }),
  };
}

const log = createLogger("page:community:map");

type HexRow = { h3: string; owner: string; ownerUsername: string | null };

export function WorldMap({ myAddress }: { myAddress: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const { t } = useLocale();
  // Every wallet linked to this player, lowercase. Drives the mine-vs-others
  // split so runs from a linked wallet also show as green.
  const linked = useLinkedAddresses(myAddress, myAddress !== null);

  const capturedByLabel = t("community.popup.capturedBy");
  const youLabel = t("community.popup.you");

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
      el.appendChild(document.createTextNode(`${capturedByLabel} `));
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
        el.appendChild(document.createTextNode(` ${youLabel}`));
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

        const hasMe = myAddress !== null && linked.size > 0;
        const mine = hasMe
          ? data.hexes.filter((h) => linked.has(h.owner.toLowerCase()))
          : [];
        const others = hasMe
          ? data.hexes.filter((h) => !linked.has(h.owner.toLowerCase()))
          : data.hexes;

        map.addSource("others", {
          type: "geojson",
          data: claimedHexesToFeatureCollection(others, linked),
        });
        map.addLayer({
          id: "others-fill",
          type: "fill",
          source: "others",
          minzoom: 9,
          paint: { "fill-color": "#FF6B35", "fill-opacity": 0.45 },
        });
        map.addLayer({
          id: "others-line",
          type: "line",
          source: "others",
          minzoom: 9,
          paint: {
            "line-color": "#FF6B35",
            "line-width": 1,
            "line-opacity": 0.85,
          },
        });

        map.addSource("others-points", {
          type: "geojson",
          data: hexesToPointCollection(others, linked),
        });
        map.addLayer({
          id: "others-points",
          type: "circle",
          source: "others-points",
          maxzoom: 11,
          paint: {
            "circle-color": "#FF6B35",
            "circle-opacity": 0.85,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              3,
              4,
              5,
              8,
              7,
              11,
              4,
            ],
          },
        });

        if (mine.length > 0) {
          map.addSource("mine", {
            type: "geojson",
            data: claimedHexesToFeatureCollection(mine, linked),
          });
          map.addLayer({
            id: "mine-fill",
            type: "fill",
            source: "mine",
            minzoom: 9,
            paint: { "fill-color": "#10B981", "fill-opacity": 0.6 },
          });
          map.addLayer({
            id: "mine-line",
            type: "line",
            source: "mine",
            minzoom: 9,
            paint: {
              "line-color": "#10B981",
              "line-width": 1.5,
              "line-opacity": 0.95,
            },
          });

          map.addSource("mine-points", {
            type: "geojson",
            data: hexesToPointCollection(mine, linked),
          });
          map.addLayer({
            id: "mine-points",
            type: "circle",
            source: "mine-points",
            maxzoom: 11,
            paint: {
              "circle-color": "#10B981",
              "circle-opacity": 0.95,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                0,
                4,
                4,
                6,
                8,
                8,
                11,
                5,
              ],
            },
          });

          map.on("click", "mine-fill", handleClick);
          map.on("click", "mine-points", handleClick);
          for (const layer of ["mine-fill", "mine-points"]) {
            map.on("mouseenter", layer, () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", layer, () => {
              map.getCanvas().style.cursor = "";
            });
          }
        }

        map.on("click", "others-fill", handleClick);
        map.on("click", "others-points", handleClick);
        for (const layer of ["others-fill", "others-points"]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }

        if (data.hexes.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          const emptySet: ReadonlySet<string> = new Set();
          for (const hex of data.hexes) {
            const fc = claimedHexesToFeatureCollection([hex], emptySet);
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
  }, [myAddress, linked, capturedByLabel, youLabel]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="text-center text-xs text-zinc-500">
        {t("community.worldmap.header")}
        {count !== null
          ? ` (${count} ${t("community.worldmap.captured")})`
          : ""}
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
