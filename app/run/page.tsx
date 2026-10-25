"use client";

import { latLngToCell } from "h3-js";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { track, trackLimited } from "@/lib/analytics";
import { isMoveMode, type MoveMode, moveMode } from "@/lib/runs/moveMode";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import {
  DEFAULT_CENTER,
  DEFAULT_MAP_STYLE,
  DEFAULT_ZOOM,
  lightMapOptions,
  FOLLOW_ZOOM,
  HEX_RESOLUTION,
  RUN_MIN_ZOOM,
} from "@/lib/map/config";
import {
  diskCoversView,
  diskKForRadius,
  diskRadiusMeters,
  hexesInBounds,
  mergeHexes,
  placeHexes,
  viewportNeedsWorld,
  rememberOwners,
  type ClaimedHexRow,
  type LngLatBounds,
  type PlacedHex,
} from "@/lib/map/claimedView";
import { haversineMeters } from "@/lib/map/geo";
import { liveGeoSource } from "@/lib/map/liveSource";
import { claimedHexesToFeatureCollection, hexesAround } from "@/lib/map/hex";
import { HEX_COLORS, strengthOpacity } from "@/lib/map/hexColors";
import { useWebglFailure } from "@/lib/map/webglFailure";
import {
  endpointLabel,
  reportServerError,
  reportWebglFailure,
} from "@/lib/client/sentryReport";
import { CloseButton } from "@/app/CloseButton";
import { holdScreenAwake } from "@/lib/wakeLock";
import {
  GPS_GAP_STALE_SECONDS,
  addHexes,
  applyHttp,
  flushDelay,
  claimRowView,
  hexesForSegment,
  hexesToQueue,
  parseQueue,
  queueStorageKey,
  takeBatch,
  type ClaimResultRow,
  type QueuedHex,
} from "@/lib/runs/claimOutbox";
import { isHexStrengthEnabled } from "@/lib/runs/hexStrength";
import { useActiveRun } from "@/lib/wallet/useActiveRun";
import { BadgeClaimPrompt } from "@/app/BadgeClaimPrompt";
import { PendingClaimPrompt } from "@/app/PendingClaimPrompt";
import { useClaimAll } from "@/lib/wallet/useClaimAll";
import { rememberRunToken } from "@/lib/wallet/runTokens";
import { useLinkedAddresses } from "@/lib/wallet/useLinkedAddresses";
import { useUser } from "@/lib/wallet/useUser";
import { useWallet } from "@/lib/wallet/useWallet";
import { GeoStatusBanner, type GeoStatus } from "./GeoStatusBanner";
import { GpsExplainer } from "./GpsExplainer";
import { markGpsAsked, shouldExplainGps } from "./gpsPrimer";
import { NeedNameOverlay } from "./NeedNameOverlay";
import { OnboardingTooltip } from "./OnboardingTooltip";
import { readCachedPosition, writeCachedPosition } from "./positionCache";
import { RunControls } from "./RunControls";
import { rowsFromWorldResponse, WORLD_GROUPED_PARAM } from "@/lib/map/worldHexes";
import { RunSummaryModal } from "./RunSummaryModal";

const log = createLogger("page:run");
// Hex strength switch, inlined at build (NEXT_PUBLIC_HEX_STRENGTH).
const HEX_STRENGTH = isHexStrengthEnabled();

// A flyTo from the default city to the player downloads every zoom along the
// path. OpenFreeMap tiles at zoom 2 are about 1.5MB each, so that flight is
// the hundreds of MB. Jump when the camera is far; ease only for a local move.
const FAR_CAMERA_METERS = 1500;
// Coarse fixes in a row before the weak-signal banner shows. One bad fix
// between good ones is normal; a streak means no GPS lock (indoors, network
// location only).
const WEAK_FIX_STREAK = 3;

/** The phone's IANA time zone, or undefined when the runtime cannot tell. */
function currentTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function placeCamera(
  map: maplibregl.Map,
  lng: number,
  lat: number,
  zoom: number,
) {
  try {
    const current = map.getCenter();
    const dist = haversineMeters(current.lat, current.lng, lat, lng);
    if (dist > FAR_CAMERA_METERS) {
      log.info("camera jump", { meters: Math.round(dist) });
      map.jumpTo({ center: [lng, lat], zoom });
      return;
    }
    map.easeTo({ center: [lng, lat], zoom, duration: 600 });
  } catch (e) {
    log.debug("camera update skipped", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function readClaimQueue(runId: string): QueuedHex[] {
  try {
    return parseQueue(localStorage.getItem(queueStorageKey(runId)));
  } catch {
    return [];
  }
}

function writeClaimQueue(runId: string, items: QueuedHex[]) {
  try {
    const key = queueStorageKey(runId);
    if (items.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // The in-memory queue still retries for this page view.
  }
}

export default function RunPage() {
  const { address, isConnected, isWrongChain } = useWallet();
  const { user } = useUser(isConnected ? address : null);
  const { t } = useLocale();
  const mapFailed = useWebglFailure(() => {
    track("map_webgl_failed", { path: "/run" });
    reportWebglFailure("/run");
  });
  const [mapNoticeClosed, setMapNoticeClosed] = useState(false);
  // The map constructor threw (no WebGL at all). The run still tracks.
  const [mapInitFailed, setMapInitFailed] = useState(false);
  const mapUnavailable = mapFailed || mapInitFailed;
  // First-run location explainer. While it is open nothing may call the
  // geolocation API, or the browser prompt would appear behind it.
  const [gpsExplain, setGpsExplain] = useState(false);
  const gpsExplainOpenRef = useRef(false);
  const pendingTrackingRef = useRef<(() => void) | null>(null);
  const { active: activeRun, isLoading: isActiveLoading } = useActiveRun(
    isConnected && !isWrongChain ? address : null,
  );
  const { claim } = useClaimAll(address, isConnected && !isWrongChain);
  const linked = useLinkedAddresses(address, isConnected && !isWrongChain);
  const linkedRef = useRef<ReadonlySet<string>>(new Set());
  const mineH3Ref = useRef<Set<string>>(new Set());
  // Hexes this run captured or stole. Painted red; older ones stay orange.
  const runH3Ref = useRef<Set<string>>(new Set());
  // Hex strength: every block already queued this run, own ones included,
  // so a pass is sent once per run (the server allows one action a day).
  const passedH3Ref = useRef<Set<string>>(new Set());
  useEffect(() => {
    linkedRef.current = linked;
  }, [linked]);
  const [badgeRefresh, setBadgeRefresh] = useState(0);
  const capturedByLabel = t("run.popup.capturedBy");
  const levelLabel = t("run.popup.level");
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
  // Where distance was last counted. Distance is measured from here, not
  // from the previous fix: at walking pace a 1 Hz GPS moves ~1.4 m per fix,
  // under the 2 m jitter floor, so measuring fix-to-fix dropped almost all
  // of a walk (runs with hundreds of blocks reported a few metres).
  const distAnchorRef = useRef<{ lat: number; lng: number } | null>(null);
  // Timestamp (Date.now()) of the last accepted GPS fix while a run is active.
  // Used to detect stale gaps: if too long has passed since the previous fix
  // (signal loss, app backgrounded, phone locked, tunnel, elevator), the
  // interpolated straight line from oldPos to newPos is a lie, because the runner
  // did not physically walk that line, they were somewhere else in between.
  // On a stale gap we drop back to endpoint-only capture.
  const lastPosTsRef = useRef<number>(0);
  // When the tab goes hidden, we cache the last (pos, ts) here so the very
  // next fix after returning can report a real gap size to analytics before
  // discarding the anchor. Cleared once consumed.
  const visibilityResetRef = useRef<{
    ts: number;
    lat: number;
    lng: number;
  } | null>(null);
  // Most recent GPS coordinate from any fix, regardless of run state. Used by
  // the "center on me" button so it works before/after a run too.
  const latestPosRef = useRef<{ lat: number; lng: number } | null>(null);
  // Distance accumulated since the last successful claim. Sent to the server
  // on the next claim, then reset to 0. Trailing residue at Finish is lost
  // (bounded by hex edge ~50m, acceptable for MVP).
  const pendingDistanceRef = useRef(0);
  // Hexes crossed but not yet accepted by the server. A failed upload stays
  // here and goes out with the next flush, instead of leaving a hole.
  const claimQueueRef = useRef<QueuedHex[]>([]);
  const claimFailuresRef = useRef(0);
  const claimRetryMsRef = useRef(0);
  const claimDrainingRef = useRef(false);
  const claimFlushTimer = useRef<number | null>(null);
  const claimFlushing = useRef(false);
  const lastClaimFlushAt = useRef(0);
  const hexRefreshPauseUntil = useRef(0);
  const flushClaimQueueRef = useRef<() => Promise<void>>(async () => {});

  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  // Set when the last few fixes were all too coarse to capture.
  const [weakAccuracyM, setWeakAccuracyM] = useState<number | null>(null);
  const coarseStreakRef = useRef(0);
  const [geoLastError, setGeoLastError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [hexCount, setHexCount] = useState(0);
  const [reinforcedCount, setReinforcedCount] = useState(0);
  const [attackedCount, setAttackedCount] = useState(0);
  // The server stopped capturing because this "on foot" run moves at vehicle
  // speed (too-fast-on-foot). Shown until 45 s pass without another one.
  const [footTooFast, setFootTooFast] = useState(false);
  const footTooFastTimer = useRef<number | null>(null);
  const footWarnedRef = useRef(false);
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [lastFinishedRun, setLastFinishedRun] = useState<{
    id: string;
    durationMs: number;
    hexesClaimed: number;
    hexesReinforced: number;
    hexesDamaged: number;
    distanceMeters: number;
    moveMode: MoveMode | null;
  } | null>(null);
  // Gate any wallet-dependent UI so SSR and first-client-render emit the
  // same tree. Without this the wallet badge appears on SSR (cookie state)
  // but not on the first client render, shifting siblings and forcing
  // React to discard the tree (which kills the live MapLibre canvas).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // Hold the map until we know where the player is. Opening on a city and
  // then jumping across the planet pulls the fat low-zoom tiles. Fresh
  // MiniPay webviews have no cached fix, so the fallback is the world origin.
  const [mapBoot, setMapBoot] = useState<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const geoFailedRef = useRef(false);
  useEffect(() => {
    const cached = readCachedPosition();
    if (cached) {
      setMapBoot({ center: [cached.lng, cached.lat], zoom: FOLLOW_ZOOM });
      return;
    }
    let cancelled = false;
    const bootAt = (center: [number, number], zoom: number) => {
      if (cancelled) return;
      setMapBoot({ center, zoom });
    };
    const started = Date.now();
    const id = window.setInterval(() => {
      const pos = latestPosRef.current;
      if (pos) {
        window.clearInterval(id);
        bootAt([pos.lng, pos.lat], FOLLOW_ZOOM);
        return;
      }
      if (geoFailedRef.current || Date.now() - started >= 12000) {
        window.clearInterval(id);
        log.info("opening map without a gps fix");
        bootAt(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  // When the app returns from background (screen unlock, tab switch back,
  // iOS home button, Android task switcher), reset the "previous GPS fix"
  // marker so the first fix post-visibility does NOT interpolate hexes
  // between wherever the runner was when they left the app and wherever
  // they are now. The gap could be seconds or hours; either way the
  // straight line is a lie. Distance keeps accumulating from the raw
  // haversine, but no phantom hexes get claimed.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!runIdRef.current) return;
      // Snapshot the pre-nuke anchor so the next fix can report the actual
      // gap size to analytics. Then reset so no interpolation happens.
      if (lastPosRef.current && lastPosTsRef.current > 0) {
        visibilityResetRef.current = {
          ts: lastPosTsRef.current,
          lat: lastPosRef.current.lat,
          lng: lastPosRef.current.lng,
        };
      }
      log.info("visibility returned, dropping stale GPS anchor");
      lastPosRef.current = null;
      distAnchorRef.current = null;
      lastPosTsRef.current = 0;
      void flushClaimQueueRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Screen on for the whole run: a sleeping screen stops GPS in the WebView.
  useEffect(() => {
    if (!runId) return;
    return holdScreenAwake();
  }, [runId]);

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
    // The run's own hexes live in memory. After a reload, ask the server so
    // they paint red again instead of plain owned orange.
    void fetch(`/api/runs/${activeRun.id}/hexes`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { h3Ids?: string[] } | null) => {
        if (!data?.h3Ids?.length) return;
        runH3Ref.current = new Set(data.h3Ids);
        for (const h3 of data.h3Ids) mineH3Ref.current.add(h3);
        // The next position update repaints the map with them.
      })
      .catch(() => {
        // Cosmetic only: the hexes still show as owned.
      });
  }, [activeRun, isActiveLoading, runId]);

  const worldRef = useRef<{ rows: PlacedHex[]; at: number } | null>(null);
  const diskCoverRef = useRef<{
    lat: number;
    lng: number;
    radiusM: number;
  } | null>(null);
  const paintGen = useRef(0);
  const worldInflight = useRef<Promise<ClaimedHexRow[] | null> | null>(null);

  const refreshClaimed = useCallback(async (reason: "move" | "fresh" = "fresh") => {
    const map = mapRef.current;
    if (!map) return;
    const gen = ++paintGen.current;
    let centerLat: number;
    let centerLng: number;
    let radius: number;
    let bounds: LngLatBounds;
    try {
      const center = map.getCenter();
      const box = map.getBounds();
      centerLat = center.lat;
      centerLng = center.lng;
      radius = 0;
      const corners: Array<[number, number]> = [
        [box.getNorth(), box.getEast()],
        [box.getNorth(), box.getWest()],
        [box.getSouth(), box.getEast()],
        [box.getSouth(), box.getWest()],
      ];
      for (const [lat, lng] of corners) {
        const dist = haversineMeters(centerLat, centerLng, lat, lng);
        if (dist > radius) radius = dist;
      }
      bounds = {
        west: box.getWest(),
        south: box.getSouth(),
        east: box.getEast(),
        north: box.getNorth(),
      };
    } catch {
      return;
    }

    const stale = () => paintGen.current !== gen || mapRef.current !== map;
    const paint = (rows: ClaimedHexRow[]) => {
      rememberOwners(mineH3Ref.current, rows, linkedRef.current);
      const source = liveGeoSource(map, "claimed-hexes");
      source?.setData(
        claimedHexesToFeatureCollection(rows, linkedRef.current, runH3Ref.current),
      );
      log.debug("claimed-view", { count: rows.length, reason, wide });
    };
    const fetchRows = async (url: string): Promise<ClaimedHexRow[] | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const backoff = res.status === 429 || res.status === 504;
          if (backoff) hexRefreshPauseUntil.current = Date.now() + 20_000;
          log.warn("claimed hexes refresh failed", {
            status: res.status,
            pace: backoff ? "claim-refresh-504-20s" : "claim-refresh-4s",
          });
          track("hexes_refresh_error", { status: res.status });
          reportServerError(endpointLabel(url), res.status);
          return null;
        }
        return rowsFromWorldResponse(await res.json());
      } catch (e) {
        log.error("failed to refresh claimed hexes", {
          message: e instanceof Error ? e.message : String(e),
        });
        trackLimited("hexes_refresh_network_error", {
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      }
    };

    const wide = viewportNeedsWorld(radius);
    if (!wide) {
      const cover = diskCoverRef.current;
      if (
        reason !== "fresh" &&
        cover &&
        diskCoversView(
          cover.lat,
          cover.lng,
          cover.radiusM,
          centerLat,
          centerLng,
          radius,
        )
      ) {
        return;
      }
      const k = diskKForRadius(radius);
      const near = latLngToCell(centerLat, centerLng, HEX_RESOLUTION);
      const rows = await fetchRows(`/api/hexes?near=${near}&k=${k}`);
      if (stale() || !rows) return;
      paint(rows);
      diskCoverRef.current = {
        lat: centerLat,
        lng: centerLng,
        radiusM: diskRadiusMeters(k),
      };
      return;
    }

    diskCoverRef.current = null;
    const worldStale =
      !worldRef.current || Date.now() - worldRef.current.at > 60_000;
    if (worldStale) {
      if (!worldInflight.current) {
        const pending = fetchRows(`/api/hexes?${WORLD_GROUPED_PARAM}`);
        worldInflight.current = pending;
        void pending.finally(() => {
          if (worldInflight.current === pending) worldInflight.current = null;
        });
      }
      const all = await worldInflight.current;
      if (stale()) return;
      if (all) worldRef.current = { rows: placeHexes(all), at: Date.now() };
    }
    if (reason === "fresh" || worldStale) {
      const addr = addressRef.current;
      if (addr) {
        const mine = await fetchRows(
          `/api/hexes?owner=${encodeURIComponent(addr)}`,
        );
        if (stale()) return;
        if (mine && worldRef.current) {
          worldRef.current = {
            rows: mergeHexes(worldRef.current.rows, placeHexes(mine)),
            at: worldRef.current.at,
          };
        } else if (mine && !worldRef.current) {
          paint(hexesInBounds(placeHexes(mine), bounds));
          return;
        }
      }
    }
    if (!worldRef.current) return;
    paint(hexesInBounds(worldRef.current.rows, bounds));
  }, []);

  /**
   * Upload every hex still waiting. One POST carries the whole queue so a
   * fast run stays under the 30 writes/minute cap. A 429 or a dropped
   * connection leaves the hexes queued.
   */
  const flushClaimQueue = useCallback(async () => {
    if (claimFlushing.current) return;
    const id = runIdRef.current;
    if (!id || claimQueueRef.current.length === 0) return;
    claimFlushing.current = true;
    const { batch } = takeBatch(claimQueueRef.current);
    const payload = {
      hexes: batch.map((item) => ({
        h3: item.h3,
        ...(item.distanceMeters > 0 ? { distanceMeters: item.distanceMeters } : {}),
        ...(typeof item.accuracy === "number" ? { accuracy: item.accuracy } : {}),
      })),
    };
    let outcome: Parameters<typeof applyHttp>[2];
    try {
      const res = await fetch(`/api/runs/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) outcome = { kind: "ended" };
      else if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { retryAfter?: number };
        const wait = Number(body.retryAfter);
        outcome = {
          kind: "rate",
          retryAfterMs: (Number.isFinite(wait) && wait > 0 ? wait : 2) * 1000,
        };
        log.warn("batch claim rate limited", {
          count: batch.length,
          retryMs: outcome.retryAfterMs,
        });
        track("batch_claim_error", { status: 429, count: batch.length });
      } else if (!res.ok) {
        outcome = { kind: "retry" };
        log.warn("batch claim failed", { status: res.status, count: batch.length });
        track("batch_claim_error", { status: res.status, count: batch.length });
        reportServerError("/api/runs/:id/claim", res.status);
      } else {
        const data = (await res.json()) as { results: ClaimResultRow[] };
        outcome = { kind: "ok", results: data.results ?? [] };
        let footRejected = 0;
        for (const row of outcome.results) {
          if (!row.h3) continue;
          if (row.rejected) {
            if (row.rejected.reason === "too-fast-on-foot") footRejected += 1;
            // Not counted: crossing it again later this run may still count.
            passedH3Ref.current.delete(row.h3);
            continue;
          }
          const view = claimRowView(row);
          if (view.ownedAfter) mineH3Ref.current.add(row.h3);
          else mineH3Ref.current.delete(row.h3);
          if (view.captured) runH3Ref.current.add(row.h3);
        }
        if (footRejected > 0) {
          setFootTooFast(true);
          if (footTooFastTimer.current !== null) window.clearTimeout(footTooFastTimer.current);
          footTooFastTimer.current = window.setTimeout(() => setFootTooFast(false), 45_000);
          if (!footWarnedRef.current) {
            footWarnedRef.current = true;
            track("run_foot_too_fast", { rejected: footRejected });
          }
        }
      }
    } catch (e) {
      outcome = { kind: "retry" };
      log.error("batch claim error", {
        count: batch.length,
        message: e instanceof Error ? e.message : String(e),
      });
      trackLimited("batch_claim_network_error", {
        count: batch.length,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    const applied = applyHttp(
      claimQueueRef.current,
      batch.map((item) => item.h3),
      outcome,
      claimFailuresRef.current,
    );
    claimQueueRef.current = applied.items;
    claimFailuresRef.current = applied.failures;
    claimRetryMsRef.current = applied.retryMs ?? 0;
    writeClaimQueue(id, applied.items);
    claimFlushing.current = false;
    if (applied.reinforced > 0) setReinforcedCount((c) => c + applied.reinforced);
    if (applied.attacked > 0) setAttackedCount((c) => c + applied.attacked);
    if (outcome.kind === "ok" && applied.newly > 0) setHexCount((c) => c + applied.newly);
    if (
      outcome.kind === "ok" &&
      (applied.newly > 0 || applied.reinforced > 0 || applied.attacked > 0)
    ) {
      await refreshClaimed();
      log.info("batch hexes claimed", {
        submitted: batch.length,
        newly: applied.newly,
        reinforced: applied.reinforced,
        attacked: applied.attacked,
      });
    }
    if (
      !claimDrainingRef.current &&
      applied.retryMs !== null &&
      applied.items.length > 0 &&
      runIdRef.current &&
      claimFlushTimer.current === null
    ) {
      claimFlushTimer.current = window.setTimeout(() => {
        claimFlushTimer.current = null;
        lastClaimFlushAt.current = Date.now();
        void flushClaimQueueRef.current();
      }, applied.retryMs);
    }
  }, [refreshClaimed]);

  useEffect(() => {
    flushClaimQueueRef.current = flushClaimQueue;
  }, [flushClaimQueue]);

  // A reload mid-run keeps unsent hexes in localStorage. MiniPay "clear
  // data" wipes that too; the retry during the run is what closes the holes.
  useEffect(() => {
    if (!runId) return;
    claimQueueRef.current = addHexes(claimQueueRef.current, readClaimQueue(runId));
    if (claimQueueRef.current.length > 0) void flushClaimQueueRef.current();
  }, [runId]);

  useEffect(() => {
    const onOnline = () => {
      if (!runIdRef.current || claimQueueRef.current.length === 0) return;
      void flushClaimQueueRef.current();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  /**
   * Remember hexes crossed since the previous fix and upload them in one
   * batch. The distance is split across the hexes so each stays under the
   * server cap. Returns once the queue has been handed to a flush, not once
   * every later retry has landed.
   */
  const claimHexes = useCallback(
    async (h3Ids: string[], totalDistance: number, accuracy?: number) => {
      const id = runIdRef.current;
      if (!id || h3Ids.length === 0) return;
      const fresh = hexesToQueue(
        h3Ids,
        mineH3Ref.current,
        passedH3Ref.current,
        HEX_STRENGTH,
      );
      for (const h3 of fresh) passedH3Ref.current.add(h3);
      if (fresh.length === 0) {
        if (totalDistance > 0) pendingDistanceRef.current += totalDistance;
        return;
      }
      const perHexDistance =
        totalDistance > 0 ? Math.round(totalDistance / fresh.length) : 0;
      const accuracyOk =
        typeof accuracy === "number" && Number.isFinite(accuracy)
          ? accuracy
          : undefined;
      claimQueueRef.current = addHexes(
        claimQueueRef.current,
        fresh.map((h3) => ({
          h3,
          distanceMeters: perHexDistance,
          ...(accuracyOk !== undefined ? { accuracy: accuracyOk } : {}),
        })),
      );
      writeClaimQueue(id, claimQueueRef.current);
      if (claimFlushing.current || claimFlushTimer.current !== null) return;
      const delay = flushDelay(lastClaimFlushAt.current, Date.now());
      if (delay === 0) {
        lastClaimFlushAt.current = Date.now();
        await flushClaimQueue();
        return;
      }
      claimFlushTimer.current = window.setTimeout(() => {
        claimFlushTimer.current = null;
        lastClaimFlushAt.current = Date.now();
        void flushClaimQueueRef.current();
      }, delay);
    },
    [flushClaimQueue],
  );

  const drainClaimQueue = useCallback(async () => {
    if (claimFlushTimer.current !== null) {
      window.clearTimeout(claimFlushTimer.current);
      claimFlushTimer.current = null;
    }
    claimDrainingRef.current = true;
    const deadline = Date.now() + 20000;
    try {
      while (Date.now() < deadline) {
        if (!claimFlushing.current) await flushClaimQueue();
        if (claimQueueRef.current.length === 0 && !claimFlushing.current) return;
        const wait = Math.max(400, claimRetryMsRef.current);
        const left = deadline - Date.now();
        if (left <= 0) break;
        await new Promise((resolve) => window.setTimeout(resolve, Math.min(wait, left)));
      }
    } finally {
      claimDrainingRef.current = false;
    }
    if (claimQueueRef.current.length > 0) {
      log.warn("claim queue still pending at finish", {
        count: claimQueueRef.current.length,
      });
    }
  }, [flushClaimQueue]);

  // Nothing is preselected. Each run starts blank and stays blocked
  // until the player taps a mode.
  const [declaredMode, setDeclaredMode] = useState<MoveMode | null>(null);
  const declaredModeRef = useRef<MoveMode | null>(null);
  const pickMode = useCallback((m: MoveMode) => {
    declaredModeRef.current = m;
    setDeclaredMode(m);
  }, []);

  const startRun = useCallback(async () => {
    const addr = addressRef.current;
    if (!addr || !declaredModeRef.current) return;
    setIsBusy(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: addr,
          mode: declaredModeRef.current,
          timeZone: currentTimeZone(),
        }),
      });
      if (!res.ok) {
        log.error("start run failed", { status: res.status });
        track("run_start_error", { status: res.status });
        return;
      }
      const data = (await res.json()) as {
        id: string;
        startedAt: string;
        claimToken?: string;
      };
      if (data.claimToken) rememberRunToken(data.id, addr, data.claimToken);
      log.info("run started", { id: data.id });
      track("run_started", declaredModeRef.current ? { mode: declaredModeRef.current } : {});
      setRunId(data.id);
      runH3Ref.current = new Set();
      passedH3Ref.current = new Set();
      setHexCount(0);
      setReinforcedCount(0);
      setAttackedCount(0);
      setDistanceMeters(0);
      setRunStartTime(Date.now());
      setFootTooFast(false);
      footWarnedRef.current = false;
      lastPosRef.current = null;
      distAnchorRef.current = null;
      lastPosTsRef.current = 0;
      pendingDistanceRef.current = 0;
      // Claim the hex we are currently standing in, if any.
      const here = currentHexRef.current;
      if (here) {
        runIdRef.current = data.id;
        await claimHexes([here], 0);
      }
    } catch (e) {
      log.error("start run network error", {
        message: e instanceof Error ? e.message : String(e),
      });
      trackLimited("run_start_network_error", {
        error: e instanceof Error ? e.message : String(e),
      });
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
      await drainClaimQueue();
      const extra = Math.round(pendingDistanceRef.current);
      const res = await fetch(`/api/runs/${id}/finish`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distanceMeters: extra > 0 ? extra : 0 }),
      });
      if (!res.ok) {
        log.error("finish run failed", { status: res.status });
        track("run_finish_error", { status: res.status });
        return;
      }
      const data = (await res.json()) as {
        hexesClaimed: number;
        hexesReinforced?: number;
        hexesDamaged?: number;
        distanceMeters: number;
        startedAt: string;
        endedAt: string;
        moveMode?: string | null;
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
        move_mode:
          (isMoveMode(data.moveMode) ? data.moveMode : moveMode(data.distanceMeters, durationSec)) ??
          "none",
        ...(HEX_STRENGTH
          ? { reinforced: data.hexesReinforced ?? 0, damaged: data.hexesDamaged ?? 0 }
          : {}),
      });
      setLastFinishedRun({
        id,
        durationMs,
        hexesClaimed: data.hexesClaimed,
        hexesReinforced: data.hexesReinforced ?? 0,
        hexesDamaged: data.hexesDamaged ?? 0,
        distanceMeters: data.distanceMeters,
        moveMode: isMoveMode(data.moveMode) ? data.moveMode : null,
      });
      // The card lists the blocks and any badges, then the wallet opens
      // on its own. A decline is not sponsored in that moment.
      setRunId(null);
      declaredModeRef.current = null;
      setDeclaredMode(null);
      // The run's red hexes become ordinary owned (orange) territory.
      runH3Ref.current = new Set();
      passedH3Ref.current = new Set();
      void refreshClaimed();
      setHexCount(0);
      setReinforcedCount(0);
      setAttackedCount(0);
      setDistanceMeters(0);
      setRunStartTime(null);
      lastPosRef.current = null;
      distAnchorRef.current = null;
      lastPosTsRef.current = 0;
      pendingDistanceRef.current = 0;
      await refreshClaimed();
    } catch (e) {
      log.error("finish run network error", {
        message: e instanceof Error ? e.message : String(e),
      });
      trackLimited("run_finish_network_error", {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsBusy(false);
    }
  }, [drainClaimQueue, refreshClaimed]);

  // Kick the geolocation request as early as possible after mount. Putting it
  // inside the map.on("load", ...) callback further down loses the iOS user-
  // gesture context that arrived with the route transition, which makes
  // WKWebView (MiniPay iOS) silently hang on getCurrentPosition. Calling it
  // synchronously from this useEffect fires it on the same task as the route
  // transition, which iOS treats as still-gestured.
  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      queueMicrotask(() => setGeoStatus("unavailable"));
      return;
    }
    geoFailedRef.current = false;
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
          placeCamera(m, longitude, latitude, FOLLOW_ZOOM);
          // Paint the position dot immediately if the map source exists. If
          // the map hasn't finished its `load` event yet (source not created),
          // the map init effect below reads latestPosRef and paints on load.
          renderPositionDot(m, latitude, longitude);
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
        geoFailedRef.current = true;
        log.warn("eager primer failed", {
          code: err.code,
          message: err.message,
        });
        queueMicrotask(() => {
          setGeoLastError(`${label}: ${err.message}`);
          if (err.code === err.PERMISSION_DENIED) setGeoStatus("denied");
          else if (err.code === err.TIMEOUT) setGeoStatus("timeout");
        });
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    if (shouldExplainGps()) {
      gpsExplainOpenRef.current = true;
      queueMicrotask(() => setGpsExplain(true));
      track("gps_prompt_shown");
      return;
    }
    requestLocation();
  }, [requestLocation]);

  // Runs inside the button's click, so the permission prompt keeps the user
  // gesture (MiniPay iOS hangs without one).
  const allowLocation = useCallback(() => {
    markGpsAsked();
    gpsExplainOpenRef.current = false;
    setGpsExplain(false);
    track("gps_prompt_accepted");
    requestLocation();
    const pending = pendingTrackingRef.current;
    pendingTrackingRef.current = null;
    pending?.();
  }, [requestLocation]);

  const retryLocation = useCallback(() => {
    track("gps_retry", { from: geoStatus });
    requestLocation();
  }, [geoStatus, requestLocation]);

  useEffect(() => {
    if (!containerRef.current || !mapBoot) return;

    const initialCenter = mapBoot.center;
    const initialZoom = mapBoot.zoom;
    log.info("initializing map", {
      center: initialCenter,
      zoom: initialZoom,
    });

    let watchId: number | null = null;
    let firstFix = true;
    let alive = true;

    // GPS tracking. Normally wired once the map loads. A phone that cannot
    // draw the map (old GPU, no WebGL) never fires "load"; it still tracks
    // and captures, without the map (see the fallback below).
    const startTracking = (map: maplibregl.Map | null) => {
      if (watchId !== null || !alive) return;
      if (gpsExplainOpenRef.current) {
        pendingTrackingRef.current = () => startTracking(map);
        return;
      }
      if (!("geolocation" in navigator)) {
        log.warn("geolocation unavailable");
        return;
      }
      // Primer fires from the top-level eager useEffect; here we only wire
      // the long-lived watchPosition for ongoing tracking.
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!alive) return;
          const { latitude, longitude, accuracy } = pos.coords;
          setGeoStatus("granted");
          log.debug("position", { lat: latitude, lng: longitude, accuracy });

          // Always render the live position dot and refresh the "center on
          // me" ref, even if accuracy is poor. The dot is UX (better a rough
          // marker than none), the accuracy gate below is only for hex
          // capture where a wrong-hex claim would corrupt the game.
          latestPosRef.current = { lat: latitude, lng: longitude };
          writeCachedPosition(latitude, longitude);
          if (map) renderPositionDot(map, latitude, longitude);

          if (firstFix) {
            log.info("first fix", { lat: latitude, lng: longitude });
            if (map) placeCamera(map, longitude, latitude, FOLLOW_ZOOM);
            firstFix = false;
          }

          // Gate the capture pipeline on accuracy. Server enforces the same
          // threshold in `lib/runs/validation.ts` (single source of truth);
          // the client filter is UX + bandwidth save.
          if (typeof accuracy === "number" && accuracy > 30) {
            log.debug("skipped capture: low accuracy", { accuracy });
            coarseStreakRef.current += 1;
            if (coarseStreakRef.current >= WEAK_FIX_STREAK) {
              const rounded = Math.round(accuracy / 10) * 10;
              setWeakAccuracyM((cur) => (cur === rounded ? cur : rounded));
            }
            // 1-in-20 sample so we can see whether "run had 5 minutes of
            // motion but captured 0 hexes" comes from a chronically-bad
            // GPS signal without spamming the event stream.
            if (Math.random() < 0.05) {
              track("gps_low_accuracy_dropped", {
                accuracy: Math.round(accuracy),
              });
            }
            return;
          }

          if (coarseStreakRef.current > 0) {
            coarseStreakRef.current = 0;
            setWeakAccuracyM(null);
          }

          // Snapshot the previous GPS fix (and its timestamp) before either
          // gets overwritten. The timestamp is what tells us whether the
          // segment is a real continuous stretch of movement or a "gap"
          // (signal loss / backgrounded app / phone locked).
          const previousPos = lastPosRef.current;
          const previousTs = lastPosTsRef.current;
          const now = Date.now();
          const gapSeconds = previousTs > 0 ? (now - previousTs) / 1000 : 0;
          const staleGap = gapSeconds > GPS_GAP_STALE_SECONDS;

          // Analytics: report visibility-triggered gaps first (the fix cache
          // was already nuked by the visibility handler, so `previousPos` is
          // null here and we cannot compute it inline). Then report time-only
          // gaps that survived visibility. Two branches, one event.
          const visReset = visibilityResetRef.current;
          if (runIdRef.current && visReset) {
            const visGapSec = (now - visReset.ts) / 1000;
            const visDist = haversineMeters(
              visReset.lat,
              visReset.lng,
              latitude,
              longitude,
            );
            track("gps_gap_detected", {
              trigger: "visibility",
              gap_seconds: Math.round(visGapSec),
              segment_distance_m: Math.round(visDist),
            });
            visibilityResetRef.current = null;
          } else if (runIdRef.current && staleGap && previousPos) {
            const gapDist = haversineMeters(
              previousPos.lat,
              previousPos.lng,
              latitude,
              longitude,
            );
            track("gps_gap_detected", {
              trigger: "time",
              gap_seconds: Math.round(gapSeconds),
              segment_distance_m: Math.round(gapDist),
            });
          }

          // Accumulate distance while a run is active. Distance still counts
          // even across stale gaps (the runner did cover ground between A
          // and B), we just refuse to CLAIM the intermediate hexes because
          // we cannot prove they walked the straight line.
          if (runIdRef.current && previousPos) {
            const anchor = distAnchorRef.current ?? previousPos;
            const seg = haversineMeters(
              anchor.lat,
              anchor.lng,
              latitude,
              longitude,
            );
            // Ignore tiny GPS jitter (<2m) around the anchor. Slow movement
            // still adds up: the anchor stays put until the phone has moved
            // past the floor, then the whole stretch counts.
            if (seg > 2) {
              pendingDistanceRef.current += seg;
              setDistanceMeters((d) => d + seg);
              distAnchorRef.current = { lat: latitude, lng: longitude };
            } else if (!distAnchorRef.current) {
              distAnchorRef.current = anchor;
            }
          } else if (runIdRef.current) {
            distAnchorRef.current = { lat: latitude, lng: longitude };
          }
          if (runIdRef.current) {
            lastPosRef.current = { lat: latitude, lng: longitude };
            lastPosTsRef.current = now;
          }

          const { hexes, currentHex } = hexesAround(
            latitude,
            longitude,
            HEX_RESOLUTION,
          );
          const previousHex = currentHexRef.current;
          if (currentHex !== previousHex) {
            log.info("entered hex", { hex: currentHex, gapSeconds, staleGap });
            currentHexRef.current = currentHex;
            if (runIdRef.current) {
              const delta = pendingDistanceRef.current;
              pendingDistanceRef.current = 0;
              // Fresh fixes keep the cells between pings. A stale gap stores
              // only the hex under this fix. The missing time is not filled
              // with a straight line.
              const claimList = hexesForSegment(
                previousPos && !staleGap ? previousPos : null,
                { lat: latitude, lng: longitude },
                staleGap ? GPS_GAP_STALE_SECONDS + 1 : gapSeconds,
                HEX_RESOLUTION,
              );
              void claimHexes(claimList, delta, accuracy);
              if (!alive) return;
              try {
                map.easeTo({
                  center: [longitude, latitude],
                  duration: 600,
                });
              } catch (e) {
                log.debug("camera follow skipped", {
                  message: e instanceof Error ? e.message : String(e),
                });
              }
            }
          }
          const source = map ? liveGeoSource(map, "hexes") : null;
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
          if (err.code === err.TIMEOUT && firstFix) setGeoStatus("timeout");
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
    };

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: DEFAULT_MAP_STYLE,
        ...lightMapOptions(),
        center: initialCenter,
        zoom: initialZoom,
        minZoom: RUN_MIN_ZOOM,
        attributionControl: { compact: true },
      });
    } catch (e) {
      // No WebGL at all: the constructor throws. Track without a map.
      log.warn("map init failed; tracking without map", {
        message: e instanceof Error ? e.message : String(e),
      });
      track("map_webgl_failed", { path: "/run" });
      reportWebglFailure("/run");
      queueMicrotask(() => setMapInitFailed(true));
      startTracking(null);
      return () => {
        alive = false;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      };
    }
    mapRef.current = map;
    // Layer listeners still fire for a touch that lands while the page
    // unmounts, and MapLibre then reads the style remove() has cleared
    // ("reading 'getLayer'", MINIKLAIM-4). They are taken off first.
    const layerListenerOffs: Array<() => void> = [];
    // The map never loaded (shader failure on old GPUs, MINIKLAIM-W): start
    // GPS anyway so the run still captures.
    const trackingFallback = window.setTimeout(() => {
      if (watchId === null) {
        log.warn("map not loaded; tracking without map");
        startTracking(map);
      }
    }, 10_000);

    map.on("load", () => {
      log.info("map loaded");
      map.resize();

      map.addSource("claimed-hexes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Red: captured or stolen in this run. Orange: already yours.
      // Gray: someone else's, yours to take.
      const ownerColor = [
        "case",
        ["get", "isRun"],
        HEX_COLORS.run,
        ["get", "isMine"],
        HEX_COLORS.mine,
        HEX_COLORS.others,
      ] as maplibregl.ExpressionSpecification;
      map.addLayer({
        id: "claimed-hex-fill",
        type: "fill",
        source: "claimed-hexes",
        paint: {
          "fill-color": ownerColor,
          // Levels (hex strength): faint at 1, solid at 10. Rows with no
          // level keep the old flat values.
          "fill-opacity": [
            "case",
            ["get", "isRun"],
            0.5,
            ["get", "isMine"],
            strengthOpacity(0.05, 0.25, 0.4),
            strengthOpacity(0.035, 0.15, 0.25),
          ],
        },
      });
      map.addLayer({
        id: "claimed-hex-line",
        type: "line",
        source: "claimed-hexes",
        paint: {
          "line-color": ownerColor,
          "line-width": 2,
          "line-opacity": ["case", ["get", "isMine"], 0.9, 0.6],
        },
      });

      map.addSource("hexes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Only the cell under the player, as an outline. No fill, so its own
      // color shows through and an owned hex does not look captured again.
      map.addLayer({
        id: "hex-line",
        type: "line",
        source: "hexes",
        filter: ["==", ["get", "isCurrent"], true],
        paint: {
          "line-color": HEX_COLORS.here,
          "line-width": 3,
          "line-opacity": 1,
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

      // If the eager primer already got a fix before the map finished loading
      // (common when the user has cached permission), paint the dot now that
      // the source exists. Otherwise the player stares at a map with no
      // "you are here" marker until watchPosition eventually fires.
      const initialPos = latestPosRef.current;
      if (initialPos) {
        renderPositionDot(map, initialPos.lat, initialPos.lng);
      }

      void refreshClaimed();
      map.on("moveend", () => {
        if (Date.now() < hexRefreshPauseUntil.current) return;
        hexRefreshPauseUntil.current = Date.now() + 4_000;
        void refreshClaimed("move");
      });

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
          strength?: number;
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
        if (typeof props.strength === "number" && props.strength > 0) {
          el.appendChild(document.createTextNode(` - ${levelLabel} ${props.strength}`));
        }
        popupRef.current = new maplibregl.Popup({
          closeButton: true,
          closeOnClick: false,
        })
          .setLngLat(e.lngLat)
          .setDOMContent(el)
          .addTo(map);
      };
      const onEnter = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = "";
      };
      map.on("click", "claimed-hex-fill", handleHexClick);
      map.on("mouseenter", "claimed-hex-fill", onEnter);
      map.on("mouseleave", "claimed-hex-fill", onLeave);
      layerListenerOffs.push(
        () => map.off("click", "claimed-hex-fill", handleHexClick),
        () => map.off("mouseenter", "claimed-hex-fill", onEnter),
        () => map.off("mouseleave", "claimed-hex-fill", onLeave),
      );

      startTracking(map);
    });

    map.on("error", (e) =>
      log.error("map error", { message: e.error?.message ?? String(e) }),
    );

    const resizeTimer = window.setTimeout(() => map.resize(), 100);

    return () => {
      alive = false;
      window.clearTimeout(resizeTimer);
      window.clearTimeout(trackingFallback);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      log.debug("disposing map");
      for (const off of layerListenerOffs) {
        try {
          off();
        } catch {
          // Already gone with the style.
        }
      }
      try {
        map.remove();
      } catch (e) {
        log.debug("map remove failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
      mapRef.current = null;
    };
  }, [
    mapBoot,
    claimHexes,
    refreshClaimed,
    capturedByLabel,
    youLabel,
    anonymousLabel,
    levelLabel,
  ]);

  const canStart = isConnected && !isWrongChain && address && !isActiveLoading;
  const isActive = runId !== null;

  return (
    <main
      className="relative h-screen w-screen overflow-hidden"
      style={{ height: "100dvh" }}
    >
      <div
        ref={containerRef}
        className="z-0 bg-zinc-100"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        }}
      />
      {mapUnavailable && !mapNoticeClosed && (
        <div className="absolute inset-x-4 top-16 z-20 flex items-start gap-2 rounded-md bg-white/95 p-3 text-sm text-zinc-800 shadow-md">
          <p className="flex-1">{t("map.webglFailed")}</p>
          <CloseButton onClick={() => setMapNoticeClosed(true)} />
        </div>
      )}
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
      <GeoStatusBanner
        status={geoStatus}
        lastError={geoLastError}
        onRetry={retryLocation}
        weakAccuracyM={runId ? weakAccuracyM : null}
      />
      <button
        onClick={() => {
          const pos = latestPosRef.current;
          const map = mapRef.current;
          if (!pos || !map) return;
          placeCamera(map, pos.lng, pos.lat, FOLLOW_ZOOM);
        }}
        aria-label="Center on my position"
        className="absolute right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-md hover:bg-white"
        style={
          isActive
            ? { bottom: "max(8rem, calc(env(safe-area-inset-bottom) + 6.5rem))" }
            : { bottom: "calc(env(safe-area-inset-bottom) + 17.25rem)" }
        }
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
      {runId && footTooFast && (
        <div
          role="status"
          className="absolute top-16 right-4 left-4 z-20 rounded-md border border-red-300 bg-red-50 p-3 text-center text-xs font-medium text-red-900 shadow-md"
        >
          {t("run.footTooFast")}
        </div>
      )}
      <RunControls
        canStart={!!canStart}
        locationReady={geoStatus === "granted"}
        isActive={isActive}
        isBusy={isBusy}
        hexCount={hexCount}
        reinforcedCount={reinforcedCount}
        attackedCount={attackedCount}
        distanceMeters={distanceMeters}
        runStartTime={runStartTime}
        onStart={startRun}
        onFinish={finishRun}
        mode={declaredMode}
        onModeChange={pickMode}
      />
      {gpsExplain && <GpsExplainer onAllow={allowLocation} />}
      {lastFinishedRun && (
        <RunSummaryModal
          summary={lastFinishedRun}
          username={user?.username ?? null}
          address={address ?? null}
          onClose={() => setLastFinishedRun(null)}
          onClaim={async () => {
            const outcome = await claim(lastFinishedRun.id);
            log.info("run claim outcome", {
              id: lastFinishedRun.id,
              outcome,
            });
            if (outcome !== "failed") setBadgeRefresh((k) => k + 1);
            return outcome !== "failed";
          }}
        />
      )}
      {mounted && isConnected && !isWrongChain && user && !user.username && (
        <NeedNameOverlay />
      )}
      {mounted && isConnected && !isWrongChain && user && !runId && (
        <OnboardingTooltip />
      )}
      <BadgeClaimPrompt
        address={address ?? null}
        surface="run"
        // Never a modal in the middle of a run.
        enabled={isConnected && !isWrongChain && !lastFinishedRun && !runId}
        refreshKey={badgeRefresh}
        detectOnMount={false}
      />
      <PendingClaimPrompt
        address={address ?? null}
        enabled={isConnected && !isWrongChain && !lastFinishedRun && !runId}
      />
    </main>
  );
}

/**
 * Push a "you are here" point feature to the map's `position` source. No-op
 * if the source has not been created yet (map still loading), so callers can
 * fire this at any time without checking readiness.
 */
function renderPositionDot(
  map: maplibregl.Map,
  lat: number,
  lng: number,
): void {
  const src = liveGeoSource(map, "position");
  if (!src) return;
  src.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [lng, lat] },
      },
    ],
  });
}
