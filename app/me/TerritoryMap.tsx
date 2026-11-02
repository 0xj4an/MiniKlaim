"use client";

import { cellToLatLng } from "h3-js";
// Types only. The module itself is loaded per tier (v6 for gl2, 5.24
// for gl1), so this import must never pull a bundle at module scope.
import type * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { isWebglFailure } from "@/lib/map/isWebglFailure";
import { DEFAULT_MAP_STYLE, lightMapOptions } from "@/lib/map/config";
import { reportGpuSupport } from "@/lib/map/gpuSupport";
import {
  claimedHexesToFeatureCollection,
  frameForCells,
  type ClaimedHexFeatureCollection,
} from "@/lib/map/hex";
import GridMap from "@/app/GridMap";
import { mapRenderStarted } from "@/lib/map/mapTelemetry";
import { useMapTier } from "@/lib/map/useMapTier";
import { useMaplibre } from "@/lib/map/useMaplibre";
import type { LngLat } from "@/lib/map/mercator";
import {
  HEX_COLORS,
  LEVEL_DARK,
  levelColor,
  levelLineWidth,
  levelValue,
} from "@/lib/map/hexColors";

const log = createLogger("page:me:map");

type HexRow = {
  h3: string;
  owner: string;
  ownerUsername: string | null;
  strength?: number;
};

export function TerritoryMap({ address }: { address: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [maxed, setMaxed] = useState(0);
  const [mapFailed, setMapFailed] = useState(false);
  // What the grid tier draws here: the thumbnail is static, so it is passed
  // straight to the canvas rather than through the shared store, where a run
  // still pushing fixes could move it.
  const [grid, setGrid] = useState<{
    hexes: ClaimedHexFeatureCollection;
    center: LngLat;
    zoom: number;
  } | null>(null);
  const { t } = useLocale();
  const mapTier = useMapTier();
  const isGrid = mapTier === "grid";
  const gl = useMaplibre(mapTier);

  // Measured on mount, not where the map is built: on /me the map only
  // exists once the player owns blocks, and on /run only once a container
  // is ready, which would have hidden exactly the new players on weak
  // phones this is meant to count.
  useEffect(() => {
    reportGpuSupport("/me");
  }, []);

  useEffect(() => {
    if (!address) return;
    // Wait for the tier: the grid has no container to check for, and
    // building MapLibre before the tier is known is how a phone with no
    // WebGL reached the constructor at all.
    if (mapTier === null) return;
    if (!isGrid && (!gl || !containerRef.current)) return;

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
        setMaxed(mine.filter((h) => h.strength === 10).length);
        if (mine.length === 0) return;
        if (!containerRef.current) {
          await new Promise((resolve) => {
            requestAnimationFrame(() => resolve(null));
          });
        }
        if (cancelled) return;

        const owners = new Set(mine.map((h) => h.owner.toLowerCase()));
        const frame = frameForCells(
          mine.map((h) => h.h3),
          { widthPx: 320, heightPx: 240, maxZoom: 16, paddingPx: 30 },
        );
        if (!frame) return;

        if (isGrid) {
          // No GPU here. The same blocks, drawn on a 2D canvas: this page is
          // a picture of the player's territory, which is exactly what the
          // grid can draw.
          mapRenderStarted("grid", "grid", "/me");
          setGrid({
            hexes: claimedHexesToFeatureCollection(mine, owners),
            center: frame.center as LngLat,
            zoom: frame.zoom,
          });
          return;
        }
        if (!containerRef.current || !gl) return;

        // MapLibre 6 requires WebGL2 and throws from the constructor when it
        // is missing, the way /run and /community already guard against. This
        // page did not, so a phone without WebGL2 took the whole of /me down
        // with it instead of just losing the thumbnail.
        let map: maplibregl.Map;
        try {
          map = new gl.Map({
            container: containerRef.current,
            style: DEFAULT_MAP_STYLE,
            ...lightMapOptions(),
            center: frame.center,
            zoom: frame.zoom,
            attributionControl: { compact: true },
            interactive: true,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          log.warn("territory map unavailable", { message });
          if (!cancelled) setMapFailed(true);
          if (isWebglFailure(message))
            track("map_webgl_failed", { path: "/me" });
          return;
        }
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
            paint: {
              "fill-color": levelColor(HEX_COLORS.mine, LEVEL_DARK.mine),
              "fill-opacity": levelValue(0.55, 0.9),
            },
          });
          map.addLayer({
            id: "mine-line",
            type: "line",
            source: "mine",
            minzoom: 11,
            paint: {
              "line-color": levelColor(HEX_COLORS.mine, LEVEL_DARK.mine),
              "line-width": levelLineWidth(1.5, 3),
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
              "circle-color": HEX_COLORS.mine,
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
  }, [address, mapTier, isGrid, gl]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="text-center text-xs text-zinc-500">
        {t("me.territory.header")}
        {count !== null ? ` (${count})` : ""}
      </p>
      {maxed > 0 && (
        <p className="text-center text-xs font-semibold text-orange-700">
          {t("me.territory.maxed").replace("{n}", String(maxed))}
        </p>
      )}
      {count === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-500">
          {t("me.territory.empty")}
        </p>
      ) : mapFailed ? (
        <p className="py-8 text-center text-xs text-zinc-500">
          {t("map.unavailable")}
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
        >
          {isGrid && grid && (
            <GridMap
              path="/me"
              hexes={grid.hexes}
              center={grid.center}
              zoom={grid.zoom}
              className="block h-full w-full"
            />
          )}
        </div>
      )}
      {isGrid && grid && (
        <p className="text-center text-[11px] text-zinc-400">
          {t("map.gridShort")}
        </p>
      )}
    </div>
  );
}
