"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type TranslationKey, useLocale } from "@/lib/i18n";
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
import { BadgeClaimPrompt } from "@/app/BadgeClaimPrompt";
import { LinkExisting } from "@/app/LinkExisting";
import { PendingClaimPrompt } from "@/app/PendingClaimPrompt";
import { useClaimRun } from "@/lib/wallet/useClaimRun";
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
  const { t } = useLocale();
  const { active: activeRun, isLoading: isActiveLoading } = useActiveRun(
    isConnected && !isWrongChain ? address : null,
  );
  const { claim } = useClaimRun(address, isConnected && !isWrongChain);
  const [badgeRefresh, setBadgeRefresh] = useState(0);
  const capturedByLabel = t("run.popup.capturedBy");
  const youLabel = t("run.popup.you");

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
  }, [claimHex, refreshClaimed, capturedByLabel, youLabel]);

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
              <span className="text-zinc-500">@</span>
              <span className="font-medium">{user.username}</span>
            </span>
          ) : (
            <span className="font-mono">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          )}
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

function GeoStatusBanner({
  status,
  lastError,
}: {
  status: GeoStatus;
  lastError: string | null;
}) {
  const { t } = useLocale();
  const [showHelp, setShowHelp] = useState(false);
  const [showMinipayIosEscape, setShowMinipayIosEscape] = useState(false);

  useEffect(() => {
    if (status !== "requesting" && status !== "idle") return;
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent ?? "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const ethereum = (window as Window & { ethereum?: { isMiniPay?: boolean } })
      .ethereum;
    const isMiniPay = ethereum?.isMiniPay === true;
    if (!isIOS || !isMiniPay) return;
    const id = window.setTimeout(() => {
      queueMicrotask(() => setShowMinipayIosEscape(true));
    }, 12000);
    return () => window.clearTimeout(id);
  }, [status]);
  useEffect(() => {
    if (status !== "requesting" && status !== "idle") {
      queueMicrotask(() => setShowHelp(false));
      return;
    }
    const id = window.setTimeout(() => {
      queueMicrotask(() => setShowHelp(true));
    }, 8000);
    return () => window.clearTimeout(id);
  }, [status]);

  if (status === "granted") return null;

  if (
    showMinipayIosEscape &&
    (status === "requesting" || status === "idle") &&
    typeof window !== "undefined"
  ) {
    const host = `${window.location.host}${window.location.pathname}`;
    const mmDeepLink = `https://metamask.app.link/dapp/${host}`;
    return (
      <div className="pointer-events-auto absolute top-16 right-4 left-4 z-10 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-center text-xs text-amber-900 shadow-md backdrop-blur">
        <p className="font-semibold">{t("run.gps.minipayIosTitle")}</p>
        <p className="text-[11px]">{t("run.gps.minipayIosBody")}</p>
        <a
          href={mmDeepLink}
          className="self-center rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
        >
          {t("run.gps.openInMetamask")}
        </a>
      </div>
    );
  }

  let message: string;
  let tone: string;
  switch (status) {
    case "idle":
    case "requesting":
      message = t("run.gps.waiting");
      tone = "bg-white/90 text-zinc-700";
      break;
    case "denied":
      message = t("run.gps.denied");
      tone = "border border-amber-300 bg-amber-50 text-amber-900";
      break;
    case "unavailable":
      message = t("run.gps.unavailable");
      tone = "border border-amber-300 bg-amber-50 text-amber-900";
      break;
  }
  return (
    <div
      className={`pointer-events-none absolute top-16 right-4 left-4 z-10 rounded-md p-3 text-center text-xs shadow-md backdrop-blur ${tone}`}
    >
      <div>{message}</div>
      {showHelp && (status === "requesting" || status === "idle") && (
        <div className="mt-1 text-[11px] text-zinc-600">
          {t("run.gps.waitingHelp")}
        </div>
      )}
      {lastError && (status === "requesting" || status === "idle") && (
        <div className="mt-1 font-mono text-[10px] text-zinc-500">
          {t("run.gps.lastError")}: {lastError}
        </div>
      )}
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
  const { t } = useLocale();
  if (!isActive) {
    return (
      <div className="absolute right-4 bottom-6 left-4 z-10 flex justify-center">
        <button
          onClick={onStart}
          disabled={!canStart || isBusy}
          className="rounded-full bg-orange-700 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-orange-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {!canStart
            ? t("run.start.signIn")
            : isBusy
              ? t("run.start.starting")
              : t("run.start.button")}
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
        {isBusy ? t("run.finish.finishing") : t("run.finish.button")}
      </button>
    </div>
  );
}

function NeedNameOverlay() {
  const { t } = useLocale();
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-6 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
        <p className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
          {t("run.needName.kicker")}
        </p>
        <p className="text-base text-zinc-700">{t("run.needName.body")}</p>
        <Link
          href="/me"
          className="rounded-full bg-orange-700 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-800"
        >
          {t("run.needName.cta")} →
        </Link>
        <LinkExisting />
      </div>
    </div>
  );
}

function RunSummaryModal({
  summary,
  username,
  onClose,
}: {
  summary: { durationMs: number; hexesClaimed: number; distanceMeters: number };
  username: string | null;
  onClose: () => void;
}) {
  const { t } = useLocale();
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
          {t("run.summary.header")}
        </p>
        <div className="grid w-full grid-cols-2 gap-3 text-center">
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {timeLabel}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("run.summary.time")}
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {summary.hexesClaimed}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("run.summary.blocks")}
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {distLabel}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("run.summary.dist")}
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold text-zinc-900">
              {paceLabel.replace("/km", "")}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("run.summary.pace")}
            </div>
          </div>
        </div>
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => shareRun(summary, timeLabel, distLabel, username, t)}
            className="rounded-full border border-zinc-300 bg-white px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            {t("run.summary.share")}
          </button>
          <button
            onClick={onClose}
            className="rounded-full bg-orange-700 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-800"
          >
            {t("run.summary.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

async function shareRun(
  summary: { durationMs: number; hexesClaimed: number; distanceMeters: number },
  timeLabel: string,
  distLabel: string,
  username: string | null,
  t: (key: TranslationKey) => string,
): Promise<void> {
  const captured =
    summary.hexesClaimed === 1
      ? t("run.share.text.one")
      : t("run.share.text.many").replace("{n}", String(summary.hexesClaimed));
  const text = `${captured} ${t("run.share.text.suffix")} ${timeLabel} - ${distLabel} ${t("run.share.text.run")}`;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.miniklaim.fun";
  const url = username ? `${origin}/p/${username}` : origin;

  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ text, url });
      return;
    } catch {
      // user cancelled or share failed; fall through to twitter intent
    }
  }
  if (typeof window !== "undefined") {
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  }
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
  const { t } = useLocale();
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
        {hexCount}{" "}
        {hexCount === 1 ? t("run.banner.block") : t("run.banner.blocks")} ·{" "}
        {distLabel} · {paceLabel}
      </div>
    </div>
  );
}
