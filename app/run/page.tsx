"use client";

import maplibregl from "maplibre-gl";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createLogger } from "@/lib/logger";
import {
  DEFAULT_CENTER,
  DEFAULT_MAP_STYLE,
  DEFAULT_ZOOM,
  FOLLOW_ZOOM,
  HEX_RESOLUTION,
} from "@/lib/map/config";
import { claimedHexesToFeatureCollection, hexesAround } from "@/lib/map/hex";
import { useUser } from "@/lib/wallet/useUser";
import { useWallet } from "@/lib/wallet/useWallet";

const log = createLogger("page:run");

type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";

export default function RunPage() {
  const { address, isConnected, isWrongChain } = useWallet();
  const { user } = useUser(isConnected ? address : null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentHexRef = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const addressRef = useRef<string | null>(null);

  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [hexCount, setHexCount] = useState(0);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  const refreshClaimed = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const res = await fetch("/api/hexes");
      const data = (await res.json()) as {
        hexes: Array<{ h3: string; owner: string }>;
      };
      const source = map.getSource("claimed-hexes") as
        | maplibregl.GeoJSONSource
        | undefined;
      source?.setData(
        claimedHexesToFeatureCollection(data.hexes, addressRef.current),
      );
      log.debug("claimed hexes refreshed", { count: data.hexes.length });
    } catch (e) {
      log.error("failed to refresh claimed hexes", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const claimHex = useCallback(
    async (h3: string) => {
      const id = runIdRef.current;
      if (!id) return;
      try {
        const res = await fetch(`/api/runs/${id}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ h3 }),
        });
        if (!res.ok) {
          log.warn("claim failed", { status: res.status, h3 });
          return;
        }
        const data = (await res.json()) as {
          ok: boolean;
          alreadyOwned: boolean;
        };
        if (!data.alreadyOwned) {
          setHexCount((c) => c + 1);
          await refreshClaimed();
          log.info("hex claimed", { h3 });
        }
      } catch (e) {
        log.error("claim error", {
          h3,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [refreshClaimed],
  );

  const startRun = useCallback(async () => {
    const addr = addressRef.current;
    if (!addr) return;
    setIsBusy(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      if (!res.ok) {
        log.error("start run failed", { status: res.status });
        return;
      }
      const data = (await res.json()) as { id: string; startedAt: string };
      log.info("run started", { id: data.id });
      setRunId(data.id);
      setHexCount(0);
      setRunStartTime(Date.now());
      // Claim the hex we are currently standing in, if any.
      const here = currentHexRef.current;
      if (here) {
        runIdRef.current = data.id;
        await claimHex(here);
      }
    } finally {
      setIsBusy(false);
    }
  }, [claimHex]);

  useEffect(() => {
    if (mapRef.current?.isStyleLoaded()) {
      void refreshClaimed();
    }
  }, [address, refreshClaimed]);

  const finishRun = useCallback(async () => {
    const id = runIdRef.current;
    if (!id) return;
    setIsBusy(true);
    try {
      const res = await fetch(`/api/runs/${id}/finish`, { method: "PATCH" });
      if (!res.ok) {
        log.error("finish run failed", { status: res.status });
        return;
      }
      const data = (await res.json()) as { hexesClaimed: number };
      log.info("run finished", { id, hexesClaimed: data.hexesClaimed });
      setRunId(null);
      setHexCount(0);
      setRunStartTime(null);
      await refreshClaimed();
    } finally {
      setIsBusy(false);
    }
  }, [refreshClaimed]);

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
          "fill-color": ["case", ["get", "isMine"], "#10B981", "#2563EB"],
          "fill-opacity": 0.4,
        },
      });
      map.addLayer({
        id: "claimed-hex-line",
        type: "line",
        source: "claimed-hexes",
        paint: {
          "line-color": ["case", ["get", "isMine"], "#10B981", "#2563EB"],
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

      void refreshClaimed();

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
          log.debug("position", { lat: latitude, lng: longitude, accuracy });

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
          const previousHex = currentHexRef.current;
          if (currentHex !== previousHex) {
            log.info("entered hex", { hex: currentHex });
            currentHexRef.current = currentHex;
            if (runIdRef.current) {
              void claimHex(currentHex);
            }
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
            return;
          }
          // POSITION_UNAVAILABLE (2) and TIMEOUT (3) are typically transient
          // on macOS / mobile. The watch keeps running and recovers on its
          // own. Don't downgrade the UI to a permanent "unavailable" state.
          log.warn("transient geolocation error", {
            code: err.code,
            message: err.message,
          });
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
      );
    });

    map.on("error", (e) =>
      log.error("map error", { message: e.error?.message ?? String(e) }),
    );

    const resizeTimer = window.setTimeout(() => map.resize(), 100);

    return () => {
      window.clearTimeout(resizeTimer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      log.debug("disposing map");
      map.remove();
      mapRef.current = null;
    };
  }, [claimHex, refreshClaimed]);

  const canStart = isConnected && !isWrongChain && address;
  const isActive = runId !== null;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div ref={containerRef} className="absolute inset-0 bg-zinc-100" />
      <Link
        href="/"
        className="absolute top-4 left-4 z-10 rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-md backdrop-blur hover:bg-white"
      >
        ← Back
      </Link>
      {address && (
        <div className="absolute top-4 right-4 z-10 rounded-md bg-white/90 px-3 py-1.5 text-xs text-zinc-700 shadow-md backdrop-blur">
          {user?.username ? (
            <span>
              <span className="text-zinc-400">@</span>
              <span className="font-medium">{user.username}</span>
            </span>
          ) : (
            <span className="font-mono">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          )}
        </div>
      )}
      <GeoStatusBanner status={geoStatus} />
      <RunControls
        canStart={!!canStart}
        isActive={isActive}
        isBusy={isBusy}
        hexCount={hexCount}
        runStartTime={runStartTime}
        onStart={startRun}
        onFinish={finishRun}
      />
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
      className={`pointer-events-none absolute top-16 right-4 left-4 z-10 rounded-md p-3 text-center text-xs shadow-md backdrop-blur ${tone}`}
    >
      {message}
    </div>
  );
}

function RunControls({
  canStart,
  isActive,
  isBusy,
  hexCount,
  runStartTime,
  onStart,
  onFinish,
}: {
  canStart: boolean;
  isActive: boolean;
  isBusy: boolean;
  hexCount: number;
  runStartTime: number | null;
  onStart: () => void;
  onFinish: () => void;
}) {
  if (!isActive) {
    return (
      <div className="absolute right-4 bottom-6 left-4 z-10 flex justify-center">
        <button
          onClick={onStart}
          disabled={!canStart || isBusy}
          className="rounded-full bg-orange-500 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {!canStart
            ? "Connect on Home to start"
            : isBusy
              ? "Starting..."
              : "Start Run"}
        </button>
      </div>
    );
  }
  return (
    <div className="absolute right-4 bottom-6 left-4 z-10 flex flex-col items-center gap-3">
      <ElapsedBanner startTime={runStartTime} hexCount={hexCount} />
      <button
        onClick={onFinish}
        disabled={isBusy}
        className="rounded-full bg-red-600 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isBusy ? "Finishing..." : "Finish Run"}
      </button>
    </div>
  );
}

function ElapsedBanner({
  startTime,
  hexCount,
}: {
  startTime: number | null;
  hexCount: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!startTime) return null;
  const elapsedMs = now - startTime;
  const mins = Math.floor(elapsedMs / 60000);
  const secs = Math.floor((elapsedMs % 60000) / 1000);
  const time = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return (
    <div className="rounded-md bg-white/95 px-4 py-2 text-center shadow-md backdrop-blur">
      <div className="font-mono text-xl font-bold text-zinc-900">{time}</div>
      <div className="text-xs text-zinc-600">{hexCount} hexes claimed</div>
    </div>
  );
}
