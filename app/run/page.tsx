"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import {
  DEFAULT_CENTER,
  DEFAULT_MAP_STYLE,
  DEFAULT_ZOOM,
  FOLLOW_ZOOM,
  HEX_RESOLUTION,
} from "@/lib/map/config";
import { haversineMeters } from "@/lib/map/geo";
import {
  claimedHexesToFeatureCollection,
  hexesAround,
  interpolateHexIds,
} from "@/lib/map/hex";
import { useActiveRun } from "@/lib/wallet/useActiveRun";
import { BadgeClaimPrompt } from "@/app/BadgeClaimPrompt";
import { PendingClaimPrompt } from "@/app/PendingClaimPrompt";
import { useClaimRun } from "@/lib/wallet/useClaimRun";
import { useLinkedAddresses } from "@/lib/wallet/useLinkedAddresses";
import { useUser } from "@/lib/wallet/useUser";
import { useWallet } from "@/lib/wallet/useWallet";
import { GeoStatusBanner, type GeoStatus } from "./GeoStatusBanner";
import { NeedNameOverlay } from "./NeedNameOverlay";
import { readCachedPosition, writeCachedPosition } from "./positionCache";
import { RunControls } from "./RunControls";
import { RunSummaryModal } from "./RunSummaryModal";

const log = createLogger("page:run");

export default function RunPage() {
  const { address, isConnected, isWrongChain } = useWallet();
  const { user } = useUser(isConnected ? address : null);
  const { t } = useLocale();
  const { active: activeRun, isLoading: isActiveLoading } = useActiveRun(
    isConnected && !isWrongChain ? address : null,
  );
  const { claim } = useClaimRun(address, isConnected && !isWrongChain);
  const linked = useLinkedAddresses(address, isConnected && !isWrongChain);
  const linkedRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    linkedRef.current = linked;
  }, [linked]);
  const [badgeRefresh, setBadgeRefresh] = useState(0);
  const capturedByLabel = t("run.popup.capturedBy");
  const youLabel = t("run.popup.you");
  const anonymousLabel = t("common.anonymous");

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
  const [geoLastError, setGeoLastError] = useState<string | null>(null);
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
        claimedHexesToFeatureCollection(data.hexes, linkedRef.current),
      );
      log.debug("claimed hexes refreshed", { count: data.hexes.length });
    } catch (e) {
      log.error("failed to refresh claimed hexes", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  /**
   * Batch-claim every hex crossed since the previous GPS fix. Splits the
   * segment's total declared distance across the hexes so per-hex distances
   * stay small and pass the server's DISTANCE_MAX_PER_CAPTURE guard even at
   * high speeds. One HTTP round trip per GPS ping regardless of hex count.
   */
  const claimHexes = useCallback(
    async (h3Ids: string[], totalDistance: number, accuracy?: number) => {
      const id = runIdRef.current;
      if (!id || h3Ids.length === 0) return;
      const perHexDistance =
        totalDistance > 0 ? Math.round(totalDistance / h3Ids.length) : 0;
      const payload = {
        hexes: h3Ids.map((h3) => ({
          h3,
          ...(perHexDistance > 0 ? { distanceMeters: perHexDistance } : {}),
          ...(typeof accuracy === "number" && Number.isFinite(accuracy)
            ? { accuracy }
            : {}),
        })),
      };
      try {
        const res = await fetch(`/api/runs/${id}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          log.warn("batch claim failed", {
            status: res.status,
            count: h3Ids.length,
          });
          return;
        }
        const data = (await res.json()) as {
          ok: boolean;
          results: Array<{
            h3: string;
            alreadyOwned?: boolean;
            rejected?: { reason: string; detail?: string };
          }>;
        };
        const newly = data.results.filter(
          (r) => !r.rejected && r.alreadyOwned === false,
        ).length;
        if (newly > 0) {
          setHexCount((c) => c + newly);
          await refreshClaimed();
          log.info("batch hexes claimed", {
            submitted: h3Ids.length,
            newly,
          });
        }
        const rejected = data.results.filter((r) => r.rejected).length;
        if (rejected > 0) {
          log.warn("batch hexes rejected", { rejected });
        }
      } catch (e) {
        log.error("batch claim error", {
          count: h3Ids.length,
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
      track("run_started");
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
        await claimHexes([here], 0);
      }
    } finally {
      setIsBusy(false);
    }
  }, [claimHexes]);

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
      const durationMs =
        new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime();
      log.info("run finished", {
        id,
        hexesClaimed: data.hexesClaimed,
        distanceMeters: data.distanceMeters,
      });
      const durationSec = Math.round(durationMs / 1000);
      track("run_finished", {
        duration_sec: durationSec,
        blocks: data.hexesClaimed,
        distance_m: Math.round(data.distanceMeters),
        speed_kmh:
          durationSec > 0
            ? Math.round((data.distanceMeters / durationSec) * 3.6 * 10) / 10
            : 0,
      });
      setLastFinishedRun({
        durationMs,
        hexesClaimed: data.hexesClaimed,
        distanceMeters: data.distanceMeters,
      });
      // Mint on-chain: the player submits their own claimRun tx (so they count
      // as a unique on-chain wallet), falling back to the sponsored relayer if
      // they cannot pay gas or decline. Fire-and-forget; the summary shows now.
      // After the hex claim settles, trigger badge detection so any badge earned
      // this run pops its own claim prompt (sequenced after the hex tx).
      void claim(id).then((outcome) => {
        log.info("run claim outcome", { id, outcome });
        setBadgeRefresh((k) => k + 1);
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
  }, [refreshClaimed, claim]);

  // Kick the geolocation request as early as possible after mount. Putting it
  // inside the map.on("load", ...) callback further down loses the iOS user-
  // gesture context that arrived with the route transition, which makes
  // WKWebView (MiniPay iOS) silently hang on getCurrentPosition. Calling it
  // synchronously from this useEffect fires it on the same task as the route
  // transition, which iOS treats as still-gestured.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      queueMicrotask(() => setGeoStatus("unavailable"));
      return;
    }
    queueMicrotask(() => setGeoStatus("requesting"));
    log.info("eager geolocation primer");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        log.info("eager primer fix", { acc: pos.coords.accuracy });
        latestPosRef.current = { lat: latitude, lng: longitude };
        writeCachedPosition(latitude, longitude);
        queueMicrotask(() => {
          setGeoStatus("granted");
          setGeoLastError(null);
        });
        const m = mapRef.current;
        if (m) {
          m.flyTo({ center: [longitude, latitude], zoom: FOLLOW_ZOOM });
        }
      },
      (err) => {
        const label =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.POSITION_UNAVAILABLE
              ? "unavailable"
              : err.code === err.TIMEOUT
                ? "timeout"
                : `code ${err.code}`;
        log.warn("eager primer failed", {
          code: err.code,
          message: err.message,
        });
        queueMicrotask(() => {
          setGeoLastError(`${label}: ${err.message}`);
          if (err.code === err.PERMISSION_DENIED) setGeoStatus("denied");
        });
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 },
    );
  }, []);

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
          el.appendChild(document.createTextNode(anonymousLabel));
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
      map.on("click", "claimed-hex-fill", handleHexClick);
      map.on("mouseenter", "claimed-hex-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "claimed-hex-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      if (!("geolocation" in navigator)) {
        log.warn("geolocation unavailable");
        return;
      }
      // Primer fires from the top-level eager useEffect; here we only wire
      // the long-lived watchPosition for ongoing tracking.
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          setGeoStatus("granted");
          log.debug("position", { lat: latitude, lng: longitude, accuracy });

          // Anti-spoof / anti-jitter: drop samples whose reported accuracy is
          // worse than 30m. Server enforces the same threshold in
          // `lib/runs/validation.ts` (single source of truth). Client filter
          // is UX + bandwidth save; server is the security boundary.
          if (typeof accuracy === "number" && accuracy > 30) {
            log.debug("dropped low-accuracy sample", { accuracy });
            return;
          }

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

          // Snapshot the previous GPS fix before it gets overwritten so the
          // interpolation below can walk the segment.
          const previousPos = lastPosRef.current;

          // Accumulate distance while a run is active.
          if (runIdRef.current && previousPos) {
            const seg = haversineMeters(
              previousPos.lat,
              previousPos.lng,
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
              // Interpolate the straight line since the previous GPS fix so
              // every hex physically crossed between pings gets captured, not
              // just the current one. Any mode of movement is fine (walk,
              // run, bike, car, plane) — the server enforces only accuracy
              // and a distance-per-capture sanity cap.
              const interpolated = previousPos
                ? interpolateHexIds(
                    previousPos.lat,
                    previousPos.lng,
                    latitude,
                    longitude,
                    HEX_RESOLUTION,
                  )
                : [currentHex];
              const claimList =
                interpolated.length > 0 ? interpolated : [currentHex];
              void claimHexes(claimList, delta, accuracy);
              // Auto-follow the runner: re-center the camera on each new hex
              // during an active run so they don't lose themselves off-screen
              // while moving. Cheap enough (once per ~50m), and players can
              // still pan freely between hex transitions.
              map.easeTo({
                center: [longitude, latitude],
                duration: 600,
              });
            }
          }
          const source = map.getSource("hexes") as
            | maplibregl.GeoJSONSource
            | undefined;
          source?.setData(hexes);
        },
        (err) => {
          const label =
            err.code === err.PERMISSION_DENIED
              ? "denied"
              : err.code === err.POSITION_UNAVAILABLE
                ? "unavailable"
                : err.code === err.TIMEOUT
                  ? "timeout"
                  : `code ${err.code}`;
          queueMicrotask(() =>
            setGeoLastError(`watch ${label}: ${err.message}`),
          );
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
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
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
  }, [claimHexes, refreshClaimed, capturedByLabel, youLabel, anonymousLabel]);

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
      {mounted && address && user?.username && (
        <div className="absolute top-4 right-4 z-10 rounded-md bg-white/90 px-3 py-1.5 text-xs text-zinc-700 shadow-md backdrop-blur">
          <span>
            <span className="text-zinc-500">@</span>
            <span className="font-medium">{user.username}</span>
          </span>
        </div>
      )}
      <GeoStatusBanner status={geoStatus} lastError={geoLastError} />
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
          username={user?.username ?? null}
          onClose={() => setLastFinishedRun(null)}
        />
      )}
      {mounted && isConnected && !isWrongChain && user && !user.username && (
        <NeedNameOverlay />
      )}
      <BadgeClaimPrompt
        address={address ?? null}
        enabled={isConnected && !isWrongChain}
        refreshKey={badgeRefresh}
        detectOnMount={false}
      />
      <PendingClaimPrompt
        address={address ?? null}
        enabled={isConnected && !isWrongChain}
      />
    </main>
  );
}
