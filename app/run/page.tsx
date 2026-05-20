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
import { formatPace, haversineMeters } from "@/lib/map/geo";
import { claimedHexesToFeatureCollection, hexesAround } from "@/lib/map/hex";
import { useActiveRun } from "@/lib/wallet/useActiveRun";
import { useUser } from "@/lib/wallet/useUser";
import { useWallet } from "@/lib/wallet/useWallet";

const log = createLogger("page:run");

type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";

const POS_CACHE_KEY = "miniklaim.lastPos";

function readCachedPosition(): { lat: number; lng: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat: number; lng: number };
    if (
      typeof parsed.lat === "number" &&
      typeof parsed.lng === "number" &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng)
    ) {
      return parsed;
    }
  } catch {
    // corrupted cache; ignore
  }
  return null;
}

function writeCachedPosition(lat: number, lng: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(POS_CACHE_KEY, JSON.stringify({ lat, lng }));
  } catch {
    // quota exceeded or storage disabled; ignore
  }
}

export default function RunPage() {
  const { address, isConnected, isWrongChain } = useWallet();
  const { user } = useUser(isConnected ? address : null);
  const { active: activeRun, isLoading: isActiveLoading } = useActiveRun(
    isConnected && !isWrongChain ? address : null,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentHexRef = useRef<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const addressRef = useRef<string | null>(null);
  // Last GPS coordinate seen *during the active run*. Used to compute the
  // haversine segment per tick. Reset to null on Start, set on each fix.
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);
  // Most recent GPS coordinate from any fix, regardless of run state. Used by
  // the "center on me" button so it works before/after a run too.
  const latestPosRef = useRef<{ lat: number; lng: number } | null>(null);
  // Distance accumulated since the last successful claim. Sent to the server
  // on the next claim, then reset to 0. Trailing residue at Finish is lost
  // (bounded by hex edge ~50m, acceptable for MVP).
  const pendingDistanceRef = useRef(0);

  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [hexCount, setHexCount] = useState(0);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [lastFinishedRun, setLastFinishedRun] = useState<{
    durationMs: number;
    hexesClaimed: number;
    distanceMeters: number;
  } | null>(null);
  // Gate any wallet-dependent UI so SSR and first-client-render emit the
  // same tree. Without this the wallet badge appears on SSR (cookie state)
  // but not on the first client render, shifting siblings and forcing
  // React to discard the tree (which kills the live MapLibre canvas).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  // Restore state from an active server-side run (e.g. after a page reload
  // mid-run). Only seeds local state if there is no local runId yet, so a
  // freshly-started run on this page does not get clobbered.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (isActiveLoading) return;
    if (!activeRun) return;
    if (runId) return;
    restoredRef.current = true;
    queueMicrotask(() => {
      log.info("resumed active run", {
        id: activeRun.id,
        hexesClaimed: activeRun.hexesClaimed,
      });
      setRunId(activeRun.id);
      setHexCount(activeRun.hexesClaimed);
      setRunStartTime(new Date(activeRun.startedAt).getTime());
    });
  }, [activeRun, isActiveLoading, runId]);

  const refreshClaimed = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      const res = await fetch("/api/hexes");
      const data = (await res.json()) as {
        hexes: Array<{
          h3: string;
          owner: string;
          ownerUsername: string | null;
        }>;
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
    async (h3: string, distanceDelta = 0) => {
      const id = runIdRef.current;
      if (!id) return;
      try {
        const res = await fetch(`/api/runs/${id}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            h3,
            ...(distanceDelta > 0 ? { distanceMeters: distanceDelta } : {}),
          }),
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
      setDistanceMeters(0);
      setRunStartTime(Date.now());
      lastPosRef.current = null;
      pendingDistanceRef.current = 0;
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
      const data = (await res.json()) as {
        hexesClaimed: number;
        distanceMeters: number;
        startedAt: string;
        endedAt: string;
      };
      log.info("run finished", {
        id,
        hexesClaimed: data.hexesClaimed,
        distanceMeters: data.distanceMeters,
      });
      setLastFinishedRun({
        durationMs:
          new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime(),
        hexesClaimed: data.hexesClaimed,
        distanceMeters: data.distanceMeters,
      });
      setRunId(null);
      setHexCount(0);
      setDistanceMeters(0);
      setRunStartTime(null);
      lastPosRef.current = null;
      pendingDistanceRef.current = 0;
      await refreshClaimed();
    } finally {
      setIsBusy(false);
    }
  }, [refreshClaimed]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Use last known position from localStorage as initial center if we have
    // one. Avoids the Bogota → user-pos flash for returning visitors. New
    // visitors fall back to DEFAULT_CENTER until first GPS fix flies them in.
    const cached = readCachedPosition();
    const initialCenter: [number, number] = cached
      ? [cached.lng, cached.lat]
      : DEFAULT_CENTER;
    const initialZoom = cached ? FOLLOW_ZOOM : DEFAULT_ZOOM;
    log.info("initializing map", {
      center: initialCenter,
      zoom: initialZoom,
      cached: cached !== null,
    });

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_MAP_STYLE,
      center: initialCenter,
      zoom: initialZoom,
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

      const popupRef = { current: null as maplibregl.Popup | null };
      const handleHexClick = (e: maplibregl.MapLayerMouseEvent) => {
        log.debug("claimed hex click", {
          features: e.features?.length ?? 0,
          point: [e.point.x, e.point.y],
        });
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as {
          owner: string;
          ownerUsername: string | null;
          isMine: boolean;
        };
        const displayName = props.ownerUsername
          ? `@${props.ownerUsername}`
          : `${props.owner.slice(0, 6)}...${props.owner.slice(-4)}`;
        const ownerLabel = props.isMine ? `${displayName} (you)` : displayName;
        popupRef.current?.remove();
        const el = document.createElement("div");
        el.style.fontSize = "13px";
        el.style.padding = "4px 6px";
        el.style.whiteSpace = "nowrap";
        el.textContent = `Owned by ${ownerLabel}`;
        popupRef.current = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: false,
        })
          .setLngLat(e.lngLat)
          .setDOMContent(el)
          .addTo(map);
      };
      map.on("click", "claimed-hex-fill", handleHexClick);
      map.on("mouseenter", "claimed-hex-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "claimed-hex-fill", () => {
        map.getCanvas().style.cursor = "";
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
          log.debug("position", { lat: latitude, lng: longitude, accuracy });

          latestPosRef.current = { lat: latitude, lng: longitude };
          writeCachedPosition(latitude, longitude);

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

          // Accumulate distance while a run is active.
          if (runIdRef.current && lastPosRef.current) {
            const seg = haversineMeters(
              lastPosRef.current.lat,
              lastPosRef.current.lng,
              latitude,
              longitude,
            );
            // Ignore tiny GPS jitter (<2m). Reduces noise without losing real
            // movement. accuracy is typically 5-20m anyway.
            if (seg > 2) {
              pendingDistanceRef.current += seg;
              setDistanceMeters((d) => d + seg);
            }
          }
          if (runIdRef.current) {
            lastPosRef.current = { lat: latitude, lng: longitude };
          }

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
              const delta = pendingDistanceRef.current;
              pendingDistanceRef.current = 0;
              void claimHex(currentHex, delta);
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

  const canStart = isConnected && !isWrongChain && address && !isActiveLoading;
  const isActive = runId !== null;

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <div
        ref={containerRef}
        className="bg-zinc-100"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
      />
      <Link
        href="/"
        className="absolute top-4 left-4 z-10 rounded-md bg-white/90 px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-md backdrop-blur hover:bg-white"
      >
        ← Back
      </Link>
      {mounted && address && (
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
      <button
        onClick={() => {
          const pos = latestPosRef.current;
          const map = mapRef.current;
          if (!pos || !map) return;
          map.flyTo({ center: [pos.lng, pos.lat], zoom: FOLLOW_ZOOM });
        }}
        aria-label="Center on my position"
        className="absolute right-4 bottom-32 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-md hover:bg-white"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </button>
      <RunControls
        canStart={!!canStart}
        isActive={isActive}
        isBusy={isBusy}
        hexCount={hexCount}
        distanceMeters={distanceMeters}
        runStartTime={runStartTime}
        onStart={startRun}
        onFinish={finishRun}
      />
      {lastFinishedRun && (
        <RunSummaryModal
          summary={lastFinishedRun}
          onClose={() => setLastFinishedRun(null)}
        />
      )}
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
  distanceMeters,
  runStartTime,
  onStart,
  onFinish,
}: {
  canStart: boolean;
  isActive: boolean;
  isBusy: boolean;
  hexCount: number;
  distanceMeters: number;
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
      <ElapsedBanner
        startTime={runStartTime}
        hexCount={hexCount}
        distanceMeters={distanceMeters}
      />
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

function RunSummaryModal({
  summary,
  onClose,
}: {
  summary: { durationMs: number; hexesClaimed: number; distanceMeters: number };
  onClose: () => void;
}) {
  const totalSec = Math.max(0, Math.floor(summary.durationMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const timeLabel = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const distLabel =
    summary.distanceMeters >= 1000
      ? `${(summary.distanceMeters / 1000).toFixed(2)} km`
      : `${summary.distanceMeters} m`;
  const paceLabel = formatPace(summary.durationMs, summary.distanceMeters);
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-6 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
          Run complete
        </p>
        <div className="grid w-full grid-cols-2 gap-3 text-center">
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {timeLabel}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              Time
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {summary.hexesClaimed}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              Hexes
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {distLabel}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              Dist
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {paceLabel.replace("/km", "")}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              Pace /km
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="mt-2 rounded-full bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ElapsedBanner({
  startTime,
  hexCount,
  distanceMeters,
}: {
  startTime: number | null;
  hexCount: number;
  distanceMeters: number;
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
  const distLabel =
    distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(2)} km`
      : `${Math.round(distanceMeters)} m`;
  const paceLabel = formatPace(elapsedMs, distanceMeters);
  return (
    <div className="rounded-md bg-white/95 px-4 py-2 text-center shadow-md backdrop-blur">
      <div className="font-mono text-xl font-bold text-zinc-900">{time}</div>
      <div className="text-xs text-zinc-600">
        {hexCount} hex · {distLabel} · {paceLabel}
      </div>
    </div>
  );
}
