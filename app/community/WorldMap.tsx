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
import { lightMapOptions } from "@/lib/map/config";
import { reportGpuSupport } from "@/lib/map/gpuSupport";
import GridMap from "@/app/GridMap";
import {
  mapContextLost,
  mapRenderFailed,
  mapRenderReady,
  watchMapRender,
  mapRenderStarted,
} from "@/lib/map/mapTelemetry";
import { useMapStyle } from "@/lib/map/useMapStyle";
import { useMapTier } from "@/lib/map/useMapTier";
import { useMaplibre } from "@/lib/map/useMaplibre";
import { zoomForSpan, type LngLat } from "@/lib/map/mercator";
import type { ClaimedHexFeatureCollection } from "@/lib/map/hex";
import {
  hexesInBounds,
  placeHexes,
  type PlacedHex,
} from "@/lib/map/claimedView";
import { claimedHexesToFeatureCollection } from "@/lib/map/hex";
import { HEX_COLORS } from "@/lib/map/hexColors";
import {
  thinWorldRows,
  WORLD_FILL_ZOOM,
  WORLD_POLYGON_CAP,
  worldPointParentRes,
} from "@/lib/map/worldPaint";
import {
  fetchWorldRows,
  parseWorldBody,
  parseWorldTotal,
  readCachedWorld,
} from "@/lib/map/worldCache";
import { useLinkedAddresses } from "@/lib/wallet/useLinkedAddresses";

type HexFeatureProps = {
  owner: string;
  ownerUsername: string | null;
  isMine: boolean;
  /** Top-10 player color, or "" (lib/map/topColors.ts). */
  topColor: string;
};

type HexRow = { h3: string; owner: string; ownerUsername: string | null };

function hexesToPointCollection(
  rows: HexRow[],
  myAddresses: ReadonlySet<string>,
  topColors: ReadonlyMap<string, string> = new Map(),
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
          topColor: myAddresses.has(h.owner.toLowerCase())
            ? ""
            : (topColors.get(h.owner.toLowerCase()) ?? ""),
        },
      };
    }),
  };
}

function setGeoSource(
  map: maplibregl.Map,
  id: string,
  data: GeoJSON.FeatureCollection,
) {
  const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
}

const log = createLogger("page:community:map");

/** The resolution the no-GPU grid draws the world at, and nothing finer. */
const GRID_RES = 2;

const EMPTY: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

// Color of a top-10 player's block; the "top" source only holds those.
const TOP_COLOR: maplibregl.ExpressionSpecification = [
  "coalesce",
  ["get", "topColor"],
  HEX_COLORS.others,
];
const CIRCLE_STROKE: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  0,
  0.5,
  4,
  1,
  8,
  1.5,
];
const CIRCLE_RADIUS: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  -2,
  2,
  0,
  3,
  2,
  4,
  4,
  5,
  6,
  6,
  8,
  7,
  11,
  4,
];

export function WorldMap({
  myAddress,
  topColors,
}: {
  myAddress: string | null;
  /** Lowercased owner -> top-10 color (lib/map/topColors.ts). */
  topColors?: ReadonlyMap<string, string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const rowsRef = useRef<HexRow[]>([]);
  const placedRef = useRef<PlacedHex[] | null>(null);
  const placedForRef = useRef<HexRow[] | null>(null);
  const paintedResRef = useRef<number | null | undefined>(undefined);
  /** Which list rowsRef holds: a parent resolution, or null for every block. */
  const loadedResRef = useRef<number | null | undefined>(undefined);
  const loadingResRef = useRef<number | null | undefined>(undefined);
  const loadForResRef = useRef<((res: number | null) => Promise<void>) | null>(null);
  const linkedRef = useRef<ReadonlySet<string>>(new Set());
  const addressRef = useRef(myAddress);
  const labelsRef = useRef({ captured: "", you: "", anon: "" });
  const boundLayers = useRef(new Set<string>());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [count, setCount] = useState<number | null>(null);
  // No WebGL: the constructor throws, which used to crash /community into
  // the error page (31 crashes from 14 players up to 23 Oct).
  const [mapUnavailable, setMapUnavailable] = useState(false);
  // The grid tier's world: one block per parent cell, the same thinning the
  // WebGL path uses at world zoom. Drawing every claimed block on a 2D canvas
  // is what would lock up the phones this tier exists for.
  const [grid, setGrid] = useState<{
    hexes: ClaimedHexFeatureCollection;
    center: LngLat;
    zoom: number;
  } | null>(null);
  const { t } = useLocale();
  const mapTier = useMapTier();
  const isGrid = mapTier === "grid";
  const gl = useMaplibre(mapTier);
  // Only the MapLibre branch waits on this; the grid draws no basemap.
  const mapStyle = useMapStyle();
  const glRef = useRef<ReturnType<typeof useMaplibre>>(null);
  glRef.current = gl;

  // Measured on mount, not where the map is built: on /me the map only
  // exists once the player owns blocks, and on /run only once a container
  // is ready, which would have hidden exactly the new players on weak
  // phones this is meant to count.
  useEffect(() => {
    reportGpuSupport("/community");
  }, []);
  const linked = useLinkedAddresses(myAddress, myAddress !== null);

  linkedRef.current = linked;
  addressRef.current = myAddress;
  const topColorsRef = useRef<ReadonlyMap<string, string>>(new Map());
  topColorsRef.current = topColors ?? new Map();
  labelsRef.current = {
    captured: t("community.popup.capturedBy"),
    you: t("community.popup.you"),
    anon: t("common.anonymous"),
  };

  const bindLayer = (map: maplibregl.Map, layer: string) => {
    if (boundLayers.current.has(layer)) return;
    boundLayers.current.add(layer);
    map.on("click", layer, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties as {
        owner: string;
        ownerUsername: string | null;
        isMine: boolean;
      };
      const labels = labelsRef.current;
      const el = document.createElement("div");
      el.style.fontSize = "13px";
      el.style.padding = "4px 6px";
      el.style.whiteSpace = "nowrap";
      el.appendChild(document.createTextNode(`${labels.captured} `));
      if (props.ownerUsername) {
        const link = document.createElement("a");
        link.href = `/p/${props.ownerUsername}`;
        link.textContent = `@${props.ownerUsername}`;
        link.style.color = "#FF6B35";
        link.style.textDecoration = "underline";
        el.appendChild(link);
      } else {
        el.appendChild(document.createTextNode(labels.anon));
      }
      if (props.isMine) {
        el.appendChild(document.createTextNode(` ${labels.you}`));
      }
      popupRef.current?.remove();
      popupRef.current = new glRef.current!.Popup({
        closeButton: true,
        closeOnClick: false,
      })
        .setLngLat(e.lngLat)
        .setDOMContent(el)
        .addTo(map);
    });
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  };

  const paintRef = useRef<(map: maplibregl.Map) => void>(() => {});
  paintRef.current = (map) => {
    try {
      const all = rowsRef.current;
      const mineSet = linkedRef.current;
      const topColors = topColorsRef.current;
      const parentRes = worldPointParentRes(map.getZoom());
      let rows: HexRow[];
      if (parentRes !== null) {
        rows = thinWorldRows(all, parentRes, (owner) => {
          const key = owner.toLowerCase();
          if (mineSet.has(key)) return 2;
          if (topColors.has(key)) return 1;
          return 0;
        });
      } else {
        if (placedForRef.current !== all) {
          placedRef.current = placeHexes(all);
          placedForRef.current = all;
        }
        const bounds = map.getBounds();
        const inView = hexesInBounds(placedRef.current ?? [], {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        });
        rows =
          inView.length > WORLD_POLYGON_CAP
            ? inView.slice(0, WORLD_POLYGON_CAP)
            : inView;
      }
      paintedResRef.current = parentRes;
      const showFill = parentRes === null;
      const hasMe = addressRef.current !== null && mineSet.size > 0;
      const mine = hasMe
        ? rows.filter((h) => mineSet.has(h.owner.toLowerCase()))
        : [];
      const notMine = hasMe
        ? rows.filter((h) => !mineSet.has(h.owner.toLowerCase()))
        : rows;
      // Top-10 players get their own small source. Everyone else stays one
      // color. The full block list is never uploaded: at world zoom these
      // rows are parent cells, and past zoom 8 they are only what is on screen.
      const top =
        topColors.size > 0
          ? notMine.filter((h) => topColors.has(h.owner.toLowerCase()))
          : [];
      const others =
        topColors.size > 0
          ? notMine.filter((h) => !topColors.has(h.owner.toLowerCase()))
          : notMine;

      setGeoSource(
        map,
        "others",
        showFill ? claimedHexesToFeatureCollection(others, mineSet) : EMPTY,
      );
      if (!map.getLayer("others-fill")) {
        map.addLayer({
          id: "others-fill",
          type: "fill",
          source: "others",
          minzoom: WORLD_FILL_ZOOM,
          paint: { "fill-color": HEX_COLORS.others, "fill-opacity": 0.45 },
        });
        map.addLayer({
          id: "others-line",
          type: "line",
          source: "others",
          minzoom: WORLD_FILL_ZOOM,
          paint: {
            "line-color": HEX_COLORS.others,
            "line-width": 1,
            "line-opacity": 0.85,
          },
        });
      }
      setGeoSource(
        map,
        "others-points",
        hexesToPointCollection(others, mineSet),
      );
      if (!map.getLayer("others-points")) {
        map.addLayer({
          id: "others-points",
          type: "circle",
          source: "others-points",
          maxzoom: 11,
          paint: {
            "circle-color": HEX_COLORS.others,
            "circle-opacity": 0.85,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": CIRCLE_STROKE,
            "circle-radius": CIRCLE_RADIUS,
          },
        });
      }
      bindLayer(map, "others-fill");
      bindLayer(map, "others-points");

      setGeoSource(
        map,
        "top",
        showFill
          ? claimedHexesToFeatureCollection(top, mineSet, new Set(), topColors)
          : EMPTY,
      );
      if (!map.getLayer("top-fill")) {
        map.addLayer({
          id: "top-fill",
          type: "fill",
          source: "top",
          minzoom: WORLD_FILL_ZOOM,
          paint: { "fill-color": TOP_COLOR, "fill-opacity": 0.65 },
        });
        map.addLayer({
          id: "top-line",
          type: "line",
          source: "top",
          minzoom: WORLD_FILL_ZOOM,
          paint: {
            "line-color": TOP_COLOR,
            "line-width": 1.5,
            "line-opacity": 0.85,
          },
        });
      }
      setGeoSource(
        map,
        "top-points",
        hexesToPointCollection(top, mineSet, topColors),
      );
      if (!map.getLayer("top-points")) {
        map.addLayer({
          id: "top-points",
          type: "circle",
          source: "top-points",
          maxzoom: 11,
          paint: {
            "circle-color": TOP_COLOR,
            "circle-opacity": 0.85,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": CIRCLE_STROKE,
            "circle-radius": CIRCLE_RADIUS,
          },
        });
      }
      bindLayer(map, "top-fill");
      bindLayer(map, "top-points");

      if (mine.length === 0) {
        for (const id of ["mine", "mine-points"]) {
          const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
          src?.setData(EMPTY);
        }
        return;
      }

      setGeoSource(
        map,
        "mine",
        showFill ? claimedHexesToFeatureCollection(mine, mineSet) : EMPTY,
      );
      if (!map.getLayer("mine-fill")) {
        map.addLayer({
          id: "mine-fill",
          type: "fill",
          source: "mine",
          minzoom: WORLD_FILL_ZOOM,
          paint: { "fill-color": HEX_COLORS.mine, "fill-opacity": 0.6 },
        });
        map.addLayer({
          id: "mine-line",
          type: "line",
          source: "mine",
          minzoom: WORLD_FILL_ZOOM,
          paint: {
            "line-color": HEX_COLORS.mine,
            "line-width": 1.5,
            "line-opacity": 0.95,
          },
        });
      }
      setGeoSource(map, "mine-points", hexesToPointCollection(mine, mineSet));
      if (!map.getLayer("mine-points")) {
        map.addLayer({
          id: "mine-points",
          type: "circle",
          source: "mine-points",
          maxzoom: 11,
          paint: {
            "circle-color": HEX_COLORS.mine,
            "circle-opacity": 0.95,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              0.5,
              4,
              1.5,
              8,
              2,
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              -2,
              2.5,
              0,
              4,
              2,
              5,
              4,
              6,
              6,
              7,
              8,
              8,
              11,
              5,
            ],
          },
        });
      }
      bindLayer(map, "mine-fill");
      bindLayer(map, "mine-points");
    } catch (e) {
      log.debug("world paint skipped", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  useEffect(() => {
    // Wait for the tier before touching MapLibre: the probe resolves in a
    // mount effect, so building first is what let a phone with no WebGL
    // reach the constructor and crash this page (31 crashes, 14 players).
    if (mapTier === null) return;
    if (!isGrid && !gl) return;
    // Stops the stall watchdog. Hoisted so the unmount cleanup can call it:
    // a player who leaves the page inside the window has not stalled, and
    // reporting them would make the metric useless.
    let settleWatch: (() => void) | null = null;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    if (isGrid) {
      // No GPU: the same world, thinned to one block per parent cell and
      // drawn on a 2D canvas. Fixed view, since there is no camera to pan.
      mapRenderStarted("grid", "grid", "/community");
      const size = {
        width: container.clientWidth || 320,
        height: container.clientHeight || 320,
      };
      const paintGrid = (rows: HexRow[], total: number | null) => {
        if (cancelled) return;
        setCount(total ?? rows.length);
        const mineSet = linkedRef.current;
        const colors = topColorsRef.current;
        const thinned = thinWorldRows(rows, 2, (owner) => {
          const key = owner.toLowerCase();
          if (mineSet.has(key)) return 2;
          if (colors.has(key)) return 1;
          return 0;
        });
        setGrid({
          hexes: claimedHexesToFeatureCollection(
            thinned,
            mineSet,
            new Set(),
            colors,
          ),
          center: [0, 0],
          // The whole planet across the shorter side, the same intent as the
          // WebGL path's slightly negative zoom.
          zoom: zoomForSpan(40_075_017, 0, size, { min: -2, max: 4 }),
        });
      };

      void (async () => {
        try {
          // The grid draws the world at res 2 and nothing finer, so it never
          // needs the full list.
          const cached = await readCachedWorld(GRID_RES);
          const cachedRows = cached ? parseWorldBody(cached.body) : null;
          if (cachedRows) paintGrid(cachedRows, parseWorldTotal(cached?.body));
          const result = await fetchWorldRows(cached, GRID_RES);
          if (!result || !result.changed) return;
          paintGrid(result.rows, result.total);
        } catch (e) {
          log.error("world grid load failed", {
            message: e instanceof Error ? e.message : String(e),
          });
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    // Stay on the whole planet. Fitting the camera to claims would hide
    // every empty continent. Zoom 0 is a 512px world; the panel is smaller,
    // so a slightly negative zoom fits every continent. Tiles still come
    // from zoom 0. The player zooms in to see a city.
    const span = Math.min(
      container.clientWidth || 320,
      container.clientHeight || 320,
    );
    const zoom = span >= 64 ? Math.min(0, Math.log2(span / 512)) : 0;
    if (!gl) return;
    if (!mapStyle) return;
    const glTier = mapTier === "gl1" ? "gl1" : "gl2";
    // How far the map got, for the watchdog to name the step it stuck in.
    let progress: "import" | "construct" | "style" | "draw" | null = null;
    const settle = watchMapRender(glTier, "maplibre", "/community", () => progress);
    settleWatch = settle;
    mapRenderStarted(glTier, "maplibre", "/community");
    const mapStartedAt =
      typeof performance === "undefined" ? Date.now() : performance.now();
    let map: maplibregl.Map;
    try {
      map = new gl.Map({
        container,
        style: mapStyle,
        ...lightMapOptions(),
        center: [0, 0],
        zoom,
        minZoom: Math.min(zoom, -2), // Allow more zoom out
        maxZoom: 18,
        attributionControl: { compact: true },
        interactive: true,
      });
    } catch (e) {
      log.warn("world map init failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      track("map_webgl_failed", { path: "/community" });
      settle();
      mapRenderFailed(glTier, "maplibre", "/community", "construct", e);
      queueMicrotask(() => setMapUnavailable(true));
      return;
    }
    mapRef.current = map;
    map.on("load", () => {
      if (cancelled) return;
      const now =
        typeof performance === "undefined" ? Date.now() : performance.now();
      settle();
      progress = "draw";
      mapRenderReady(glTier, "maplibre", "/community", now - mapStartedAt);
      map.resize();
      if (rowsRef.current.length > 0) paintRef.current(map);
    });

    // Zoom changes which cells are drawn. The set is parent cells, or the
    // blocks on screen, so this is not the full-world upload that crashed
    // the tab on 25 Oct.
    let paintTimer: number | null = null;
    map.on("moveend", () => {
      if (cancelled) return;
      const next = worldPointParentRes(map.getZoom());
      // A zoom that crosses into another resolution, or into the polygon
      // zone, needs a different list from the server, not just a repaint.
      if (next !== loadedResRef.current) {
        if (paintTimer !== null) window.clearTimeout(paintTimer);
        paintTimer = window.setTimeout(() => {
          paintTimer = null;
          void loadForResRef.current?.(next);
        }, 200);
        return;
      }
      if (rowsRef.current.length === 0) return;
      if (next !== null && next === paintedResRef.current) return;
      if (paintTimer !== null) window.clearTimeout(paintTimer);
      paintTimer = window.setTimeout(() => {
        paintTimer = null;
        if (!cancelled) paintRef.current(map);
      }, 200);
    });

    map.on("webglcontextlost", (event) => {
      event.originalEvent.preventDefault();
      log.error("webgl context lost");
      mapContextLost(glTier, "/community");
      cancelled = true;
      if (paintTimer !== null) window.clearTimeout(paintTimer);
      queueMicrotask(() => setMapUnavailable(true));
    });

    map.on("error", (e) => {
      log.error("map error", { message: e.error?.message ?? String(e) });
      settle();
      mapRenderFailed(glTier, "maplibre", "/community", "style", e.error ?? e);
    });

    const paintRows = (rows: HexRow[], total: number | null) => {
      if (cancelled) return;
      rowsRef.current = rows;
      // The header counts captured blocks, not the dots drawn. The thinned
      // list carries the real total; the full list is its own length.
      setCount(total ?? rows.length);
      const draw = () => {
        if (!cancelled) paintRef.current(map);
      };
      if (map.isStyleLoaded()) requestAnimationFrame(draw);
      else map.once("load", draw);
    };

    /**
     * Load the list this zoom actually draws.
     *
     * At world zoom that is one row per parent cell, about two thousand of
     * them. Downloading all 303,000 blocks to draw those dots is what put
     * ~1 MB on the wire for every visit, and the proxy logged 12,204
     * clients dropping mid-download in four days. The full list is fetched
     * only when the player zooms past WORLD_FILL_ZOOM, where polygons are
     * drawn and every block matters.
     */
    const loadForRes = async (res: number | null) => {
      if (cancelled || loadingResRef.current === res) return;
      loadingResRef.current = res;
      try {
        const cached = await readCachedWorld(res);
        const cachedRows = cached ? parseWorldBody(cached.body) : null;
        if (cachedRows) {
          loadedResRef.current = res;
          paintRows(cachedRows, parseWorldTotal(cached?.body));
        }
        const result = await fetchWorldRows(cached, res);
        if (!result) return;
        loadedResRef.current = res;
        if (!result.changed && cachedRows) return;
        paintRows(result.rows, result.total);
      } catch (e) {
        log.error("world map load failed", {
          res,
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (loadingResRef.current === res) loadingResRef.current = undefined;
      }
    };
    loadForResRef.current = loadForRes;

    void loadForRes(worldPointParentRes(zoom));

    const layers = boundLayers.current;
    return () => {
      cancelled = true;
      settleWatch?.();
      if (paintTimer !== null) window.clearTimeout(paintTimer);
      layers.clear();
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapTier, isGrid, gl, mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    paintRef.current(map);
  }, [linked, myAddress, topColors]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="text-center text-xs text-zinc-500">
        {t("community.worldmap.header")}
        {count !== null
          ? ` (${count} ${t("community.worldmap.captured")})`
          : ""}
      </p>
      {mapUnavailable && (
        <p className="py-2 text-center text-xs text-zinc-600">
          {t("map.unavailable")}
        </p>
      )}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          display: mapUnavailable ? "none" : undefined,
          height: 320,
          borderRadius: 6,
          overflow: "hidden",
          backgroundColor: "#f4f4f5",
        }}
      >
        {isGrid && grid && (
          <GridMap
            path="/community"
            hexes={grid.hexes}
            center={grid.center}
            zoom={grid.zoom}
            className="block h-full w-full"
          />
        )}
      </div>
      {isGrid && (
        <p className="text-center text-[11px] text-zinc-400">
          {t("map.gridShort")}
        </p>
      )}
    </div>
  );
}
