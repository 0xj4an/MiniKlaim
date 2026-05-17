"use client";

import maplibregl from "maplibre-gl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import {
  DEFAULT_CENTER,
  DEFAULT_MAP_STYLE,
  DEFAULT_ZOOM,
  FOLLOW_ZOOM,
  HEX_RESOLUTION,
} from "@/lib/map/config";
import { claimedHexesToFeatureCollection, hexesAround } from "@/lib/map/hex";

const log = createLogger("page:run");

type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";

export default function RunPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentHexRef = useRef<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");

  useEffect(() => {
    if (!containerRef.current) return;
    log.info("initializing map", {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    let watchId: number | null = null;
    let firstFix = true;

    map.on("load", () => {
      log.info("map loaded");
      map.resize();

      map.addSource("claimed-hexes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "claimed-hex-fill",
        type: "fill",
        source: "claimed-hexes",
        paint: {
          "fill-color": "#2563EB",
          "fill-opacity": 0.4,
        },
      });
      map.addLayer({
        id: "claimed-hex-line",
        type: "line",
        source: "claimed-hexes",
        paint: {
          "line-color": "#2563EB",
          "line-width": 1.5,
          "line-opacity": 0.9,
        },
      });

      map.addSource("hexes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "hex-fill",
        type: "fill",
        source: "hexes",
        paint: {
          "fill-color": "#FF6B35",
          "fill-opacity": ["case", ["get", "isCurrent"], 0.35, 0.05],
        },
      });
      map.addLayer({
        id: "hex-line",
        type: "line",
        source: "hexes",
        paint: {
          "line-color": "#FF6B35",
          "line-width": ["case", ["get", "isCurrent"], 2, 1],
          "line-opacity": ["case", ["get", "isCurrent"], 0.9, 0.5],
        },
      });

      void (async () => {
        try {
          const res = await fetch("/api/hexes");
          const data = (await res.json()) as {
            hexes: Array<{ h3: string; owner: string }>;
          };
          log.info("claimed hexes loaded", { count: data.hexes.length });
          const source = map.getSource("claimed-hexes") as
            | maplibregl.GeoJSONSource
            | undefined;
          source?.setData(claimedHexesToFeatureCollection(data.hexes));
        } catch (e) {
          log.error("failed to load claimed hexes", {
            message: e instanceof Error ? e.message : String(e),
          });
        }
      })();

      map.addSource("position", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "position-circle",
        type: "circle",
        source: "position",
        paint: {
          "circle-radius": 8,
          "circle-color": "#FF6B35",
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 3,
        },
      });

      if (!("geolocation" in navigator)) {
        setGeoStatus("unavailable");
        log.warn("geolocation unavailable");
        return;
      }
      setGeoStatus("requesting");
      log.info("requesting geolocation");

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          setGeoStatus("granted");
          log.debug("position", {
            lat: latitude,
            lng: longitude,
            accuracy,
          });

          if (firstFix) {
            log.info("first fix", { lat: latitude, lng: longitude });
            map.flyTo({
              center: [longitude, latitude],
              zoom: FOLLOW_ZOOM,
            });
            firstFix = false;
          }

          const positionSource = map.getSource("position") as
            | maplibregl.GeoJSONSource
            | undefined;
          positionSource?.setData({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Point",
                  coordinates: [longitude, latitude],
                },
              },
            ],
          });

          const { hexes, currentHex } = hexesAround(
            latitude,
            longitude,
            HEX_RESOLUTION,
          );
          if (currentHex !== currentHexRef.current) {
            log.info("entered hex", { hex: currentHex });
            currentHexRef.current = currentHex;
          }
          const source = map.getSource("hexes") as
            | maplibregl.GeoJSONSource
            | undefined;
          source?.setData(hexes);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setGeoStatus("denied");
            log.warn("geolocation denied");
          } else {
            setGeoStatus("unavailable");
            log.error("geolocation error", {
              code: err.code,
              message: err.message,
            });
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
      );
    });

    map.on("error", (e) =>
      log.error("map error", {
        message: e.error?.message ?? String(e),
      }),
    );

    const resizeTimer = window.setTimeout(() => map.resize(), 100);

    return () => {
      window.clearTimeout(resizeTimer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      log.debug("disposing map");
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div ref={containerRef} className="absolute inset-0 bg-zinc-100" />
      <Link
        href="/"
        className="absolute top-4 left-4 z-10 rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-md backdrop-blur hover:bg-white"
      >
        ← Back
      </Link>
      <GeoStatusBanner status={geoStatus} />
    </main>
  );
}

function GeoStatusBanner({ status }: { status: GeoStatus }) {
  if (status === "granted") return null;
  let message: string;
  let tone: string;
  switch (status) {
    case "idle":
    case "requesting":
      message = "Waiting for GPS...";
      tone = "bg-white/90 text-zinc-700";
      break;
    case "denied":
      message = "Location denied. Enable it in browser settings to track runs.";
      tone = "border border-amber-300 bg-amber-50 text-amber-900";
      break;
    case "unavailable":
      message = "Location unavailable on this device.";
      tone = "border border-amber-300 bg-amber-50 text-amber-900";
      break;
  }
  return (
    <div
      className={`pointer-events-none absolute right-4 bottom-20 left-4 z-10 rounded-md p-3 text-center text-xs shadow-md backdrop-blur ${tone}`}
    >
      {message}
    </div>
  );
}
