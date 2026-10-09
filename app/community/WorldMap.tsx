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

type HexRow = { h3: string; owner: string; ownerUsername: string | null };

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

export function WorldMap({ myAddress }: { myAddress: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const rowsRef = useRef<HexRow[]>([]);
  const linkedRef = useRef<ReadonlySet<string>>(new Set());
  const addressRef = useRef(myAddress);
  const labelsRef = useRef({ captured: "", you: "", anon: "" });
  const boundLayers = useRef(new Set<string>());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const { t } = useLocale();
  const linked = useLinkedAddresses(myAddress, myAddress !== null);

  linkedRef.current = linked;
  addressRef.current = myAddress;
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
      const others = hasMe
        ? rows.filter((h) => !mineSet.has(h.owner.toLowerCase()))
        : rows;

      setGeoSource(
        map,
        "others",
        claimedHexesToFeatureCollection(others, mineSet),
      );
      if (!map.getLayer("others-fill")) {
        map.addLayer({
          id: "others-fill",
          type: "fill",
          source: "others",
          minzoom: 8, // Lower threshold for better visibility
          paint: { "fill-color": "#FF6B35", "fill-opacity": 0.45 },
        });
        map.addLayer({
          id: "others-line",
          type: "line",
          source: "others",
          minzoom: 8,
          paint: {
            "line-color": "#FF6B35",
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
            "circle-color": "#FF6B35",
            "circle-opacity": 0.85,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0, 0.5,
              4, 1,
              8, 1.5,
            ],
            "circle-radius": [
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
            ],
          },
        });
      }
      bindLayer(map, "others-fill");
      bindLayer(map, "others-points");

      if (mine.length === 0) return;

      setGeoSource(map, "mine", claimedHexesToFeatureCollection(mine, mineSet));
      if (!map.getLayer("mine-fill")) {
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
      }
      setGeoSource(map, "mine-points", hexesToPointCollection(mine, mineSet));
      if (!map.getLayer("mine-points")) {
        map.addLayer({
          id: "mine-points",
          type: "circle",
          source: "mine-points",
          maxzoom: 11,
          paint: {
            "circle-color": "#10B981",
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
    const map = new maplibregl.Map({
      container,
      style: DEFAULT_MAP_STYLE,
      center: [0, 0],
      zoom,
      minZoom: Math.min(zoom, -2), // Allow more zoom out
      maxZoom: 18,
      attributionControl: { compact: true },
      interactive: true,
    });
    mapRef.current = map;
    map.on("load", () => {
      if (cancelled) return;
      map.resize();
      // Only paint if we already have data
      if (rowsRef.current.length > 0) {
        paintRef.current(map);
      }
    });
    
    map.on("zoomend", () => {
      if (cancelled || rowsRef.current.length === 0) return;
      paintRef.current(map);
    });
    
    map.on("error", (e) =>
      log.error("map error", { message: e.error?.message ?? String(e) }),
    );

    void (async () => {
      try {
        const res = await fetch("/api/hexes");
        if (!res.ok) {
          log.warn("world hexes failed", { status: res.status });
          return;
        }
        const data = (await res.json()) as { hexes: HexRow[] };
        if (cancelled) return;
        rowsRef.current = data.hexes;
        setCount(data.hexes.length);
        
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
  }, [linked, myAddress]);

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
