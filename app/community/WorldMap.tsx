"use client";

import { cellToLatLng } from "h3-js";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { DEFAULT_MAP_STYLE, lightMapOptions } from "@/lib/map/config";
import { reportGpuSupport } from "@/lib/map/gpuSupport";
import { claimedHexesToFeatureCollection } from "@/lib/map/hex";
import { HEX_COLORS } from "@/lib/map/hexColors";
import { rowsFromWorldResponse, WORLD_GROUPED_PARAM } from "@/lib/map/worldHexes";
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
  0, 0.5,
  4, 1,
  8, 1.5,
];
const CIRCLE_RADIUS: maplibregl.ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  -2, 2,
  0, 3,
  2, 4,
  4, 5,
  6, 6,
  8, 7,
  11, 4,
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
  const linkedRef = useRef<ReadonlySet<string>>(new Set());
  const addressRef = useRef(myAddress);
  const labelsRef = useRef({ captured: "", you: "", anon: "" });
  const boundLayers = useRef(new Set<string>());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [count, setCount] = useState<number | null>(null);
  // No WebGL: the constructor throws, which used to crash /community into
  // the error page (31 crashes from 14 players up to 23 Oct).
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const { t } = useLocale();

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
      popupRef.current = new maplibregl.Popup({
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
      const rows = rowsRef.current;
      const mineSet = linkedRef.current;
      const hasMe = addressRef.current !== null && mineSet.size > 0;
      const mine = hasMe
        ? rows.filter((h) => mineSet.has(h.owner.toLowerCase()))
        : [];
      const notMine = hasMe
        ? rows.filter((h) => !mineSet.has(h.owner.toLowerCase()))
        : rows;
      // Top-10 players get their own small source. The big one (everyone
      // else, ~250k hexes) keeps constant paint: a data-driven color on it
      // means a per-feature paint buffer for every polygon, point and line,
      // which is what MiniPay's WebView could not take (25 Oct).
      const topColors = topColorsRef.current;
      const top = topColors.size > 0
        ? notMine.filter((h) => topColors.has(h.owner.toLowerCase()))
        : [];
      const others = topColors.size > 0
        ? notMine.filter((h) => !topColors.has(h.owner.toLowerCase()))
        : notMine;

      setGeoSource(map, "others", claimedHexesToFeatureCollection(others, mineSet));
      if (!map.getLayer("others-fill")) {
        map.addLayer({
          id: "others-fill",
          type: "fill",
          source: "others",
          minzoom: 8, // Lower threshold for better visibility
          paint: { "fill-color": HEX_COLORS.others, "fill-opacity": 0.45 },
        });
        map.addLayer({
          id: "others-line",
          type: "line",
          source: "others",
          minzoom: 8,
          paint: {
            "line-color": HEX_COLORS.others,
            "line-width": 1,
            "line-opacity": 0.85,
          },
        });
      }
      setGeoSource(map, "others-points", hexesToPointCollection(others, mineSet));
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
        claimedHexesToFeatureCollection(top, mineSet, new Set(), topColors),
      );
      if (!map.getLayer("top-fill")) {
        map.addLayer({
          id: "top-fill",
          type: "fill",
          source: "top",
          minzoom: 8,
          paint: { "fill-color": TOP_COLOR, "fill-opacity": 0.65 },
        });
        map.addLayer({
          id: "top-line",
          type: "line",
          source: "top",
          minzoom: 8,
          paint: { "line-color": TOP_COLOR, "line-width": 1.5, "line-opacity": 0.85 },
        });
      }
      setGeoSource(map, "top-points", hexesToPointCollection(top, mineSet, topColors));
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

      if (mine.length === 0) return;

      setGeoSource(map, "mine", claimedHexesToFeatureCollection(mine, mineSet));
      if (!map.getLayer("mine-fill")) {
        map.addLayer({
          id: "mine-fill",
          type: "fill",
          source: "mine",
          minzoom: 9,
          paint: { "fill-color": HEX_COLORS.mine, "fill-opacity": 0.6 },
        });
        map.addLayer({
          id: "mine-line",
          type: "line",
          source: "mine",
          minzoom: 9,
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
              0, 0.5,
              4, 1.5,
              8, 2,
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              -2, 2.5,
              0, 4,
              2, 5,
              4, 6,
              6, 7,
              8, 8,
              11, 5,
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
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    // Stay on the whole planet. Fitting the camera to claims would hide
    // every empty continent. Zoom 0 is a 512px world; the panel is smaller,
    // so a slightly negative zoom fits every continent. Tiles still come
    // from zoom 0. The player zooms in to see a city.
    const span = Math.min(
      container.clientWidth || 320,
      container.clientHeight || 320,
    );
    const zoom = span >= 64 ? Math.min(0, Math.log2(span / 512)) : 0;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: DEFAULT_MAP_STYLE,
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
      queueMicrotask(() => setMapUnavailable(true));
      return;
    }
    mapRef.current = map;
    map.on("load", () => {
      if (cancelled) return;
      map.resize();
      // Only paint if we already have data
      if (rowsRef.current.length > 0) {
        paintRef.current(map);
      }
    });
    
    // No repaint on zoom. The data does not change with the camera, and a
    // repaint rebuilds ~250k polygon and point features and re-uploads them
    // with per-feature colors: on MiniPay's WebView that crashed the tab on
    // every zoom (25 Oct). Layer minzoom/maxzoom already handle what shows.

    map.on("error", (e) =>
      log.error("map error", { message: e.error?.message ?? String(e) }),
    );

    void (async () => {
      try {
        const res = await fetch(`/api/hexes?${WORLD_GROUPED_PARAM}`);
        if (!res.ok) {
          log.warn("world hexes failed", { status: res.status });
          return;
        }
        const rows: HexRow[] = rowsFromWorldResponse(await res.json());
        if (cancelled) return;
        rowsRef.current = rows;
        setCount(rows.length);
        
        // Paint immediately if map is ready, otherwise wait for load event
        if (map.isStyleLoaded()) {
          paintRef.current(map);
        } else {
          const onLoad = () => {
            if (!cancelled) paintRef.current(map);
          };
          map.once("load", onLoad);
        }
      } catch (e) {
        log.error("world map load failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    const layers = boundLayers.current;
    return () => {
      cancelled = true;
      layers.clear();
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

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
      />
    </div>
  );
}
