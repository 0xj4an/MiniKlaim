"use client";

import { TreasureFound, type FoundTreasure } from "@/app/TreasureFound";
import { TreasureHeat } from "@/app/TreasureHeat";
import { latLngToCell } from "h3-js";
// Types only. The module itself is loaded per tier (v6 for gl2, 5.24
// for gl1), so this import must never pull a bundle at module scope.
import type * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { track, trackLimited } from "@/lib/analytics";
import { isMoveMode, type MoveMode, moveMode } from "@/lib/runs/moveMode";
import { captureStatus } from "@/lib/runs/captureStatus";
import {
  GPS_STUCK_AFTER_MS,
  shownDistanceMeters,
  startSpot,
} from "@/lib/runs/runSummaryCopy";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  lightMapOptions,
  FOLLOW_ZOOM,
  HEX_RESOLUTION,
  RUN_MIN_ZOOM,
} from "@/lib/map/config";
import { foldAttributionLater } from "@/lib/map/attribution";
import { reportGpuSupport } from "@/lib/map/gpuSupport";
import {
  diskCoversView,
  diskKForRadius,
  diskRadiusMeters,
  hexesInBounds,
  mergeHexes,
  patchRows,
  placeHexes,
  viewportNeedsWorld,
  rememberOwners,
  shouldFetchOwnList,
  RUN_WORLD_MAX_AGE_MS,
  type RefreshReason,
  type RowChange,
  type ClaimedHexRow,
  type LngLatBounds,
  type PlacedHex,
} from "@/lib/map/claimedView";
import { withOwnFloor, type PaintRow } from "@/lib/map/ownFloor";
import { RUN_DOT_ZOOM, thinForDots, toPointCollection } from "@/lib/map/runDots";
import {
  backoffSeconds,
  CLAIMED_REFRESH_MIN_MS,
  mapRunProps,
  newMapRunStats,
  noteZoom,
} from "@/lib/map/refreshBackoff";
import {
  nextCourse,
  readOrientation,
  writeOrientation,
  type CourseState,
  type MapOrientation,
} from "@/lib/map/course";
import { haversineMeters } from "@/lib/map/geo";
import { liveGeoSource } from "@/lib/map/liveSource";
import { causeOf } from "@/lib/map/mapFailureKind";
import { claimedHexesToFeatureCollection, hexesAround } from "@/lib/map/hex";
import { getGridData, resetGridData, setGridData } from "@/lib/map/gridStore";
import { viewportFromCenter } from "@/lib/map/viewport";
import { useMapStyle } from "@/lib/map/useMapStyle";
import { useMapTier } from "@/lib/map/useMapTier";
import { useMaplibre } from "@/lib/map/useMaplibre";
import {
  mapContextLost,
  mapContextRestored,
  mapNoticeDismissed,
  mapRenderFailed,
  mapRenderReady,
  mapRenderStarted,
} from "@/lib/map/mapTelemetry";
import GridMap from "@/app/GridMap";
import {
  HEX_COLORS,
  LEVEL_DARK,
  levelColor,
  levelLineWidth,
  levelValue,
} from "@/lib/map/hexColors";
import { useTopColors } from "@/lib/useTopColors";
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
  claimPayload,
  CLAIM_TIMEOUT_MS,
  type ClaimResultRow,
  type QueuedHex,
} from "@/lib/runs/claimOutbox";
import { isHexStrengthEnabled } from "@/lib/runs/hexStrength";
import { useActiveRun } from "@/lib/wallet/useActiveRun";
import { BadgeClaimPrompt } from "@/app/BadgeClaimPrompt";
import { PendingClaimPrompt } from "@/app/PendingClaimPrompt";
import { useClaimAll } from "@/lib/wallet/useClaimAll";
import { rememberRunToken, runToken, runTokenHeaders } from "@/lib/wallet/runTokens";
import { buildDiffers, claimReload, liveBuild } from "@/lib/runs/staleClient";
import { useLinkedAddresses } from "@/lib/wallet/useLinkedAddresses";
import { useUser } from "@/lib/wallet/useUser";
import { useWallet } from "@/lib/wallet/useWallet";
import { GeoStatusBanner, type GeoStatus } from "./GeoStatusBanner";
import { GpsExplainer } from "./GpsExplainer";
import {
  geoStatusForError,
  markGpsAsked,
  readGeolocationPermission,
  shouldExplainGps,
} from "./gpsPrimer";
import { CaptureBursts, type CaptureBurst } from "./CaptureBursts";
import { MapLegend } from "./MapLegend";
import { readCachedPosition, writeCachedPosition } from "./positionCache";
import { FINE_FIX, nextFixAttempt } from "./gpsAttempts";
import { RunControls } from "./RunControls";
import { rowsFromWorldResponse } from "@/lib/map/worldHexes";
import {
  fetchWorldRows,
  parseWorldBody,
  readCachedWorld,
} from "@/lib/map/worldCache";
import { RunSummaryModal } from "./RunSummaryModal";
import { ChallengeRunChip } from "./ChallengeRunBits";

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
/**
 * New blocks in one server answer from which the number is labelled as a
 * saved queue. A flush goes out every 2.5 s; ten blocks in that time is
 * over 250 km/h, so on the ground this many means a queue caught up.
 */
const LATE_BURST_MIN = 10;

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

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

  // Measured on mount, not where the map is built: on /me the map only
  // exists once the player owns blocks, and on /run only once a container
  // is ready, which would have hidden exactly the new players on weak
  // phones this is meant to count.
  useEffect(() => {
    reportGpuSupport("/run");
  }, []);
  // Which renderer this phone gets. Null for the first render, since probing
  // a GPU needs a browser and rendering one map on the server and another on
  // the client is a hydration mismatch.
  const mapTier = useMapTier();
  const isGrid = mapTier === "grid";
  // The MapLibre this tier uses, once loaded. Null on the grid tier, which
  // must never download a map bundle.
  const gl = useMaplibre(mapTier);
  // Only the MapLibre branch waits on this; the grid draws no basemap.
  const mapStyle = useMapStyle();
  // Read inside callbacks that must not be rebuilt when the tier arrives.
  const isGridRef = useRef(false);
  isGridRef.current = isGrid;
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
  // Own blocks reinforced in this run. Painted with a green rim.
  const reinforcedH3Ref = useRef<Set<string>>(new Set());
  // Someone else's blocks attacked in this run -> the level each was left at.
  const attackedLeftRef = useRef<Map<string, number>>(new Map());
  // Hex strength: every block already queued this run, own ones included,
  // so a pass is sent once per run (the server allows one action a day).
  const passedH3Ref = useRef<Set<string>>(new Set());
  // Blocks already acted on today, from the server and from this session.
  // One action per block per player per day: these are spent until tomorrow.
  const usedTodayRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    linkedRef.current = linked;
  }, [linked]);
  // Top-10 players' colors on their blocks (lib/map/topColors.ts).
  const topColors = useTopColors();
  const topColorsRef = useRef<ReadonlyMap<string, string>>(new Map());
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
  /** The player's name, so a floored row labels the same as a server one. */
  const userRef = useRef<string | null>(null);
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
    kept: boolean;
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
  // The server rows behind the last paint, kept so a capture can be drawn
  // the moment it is queued without asking the server again.
  const lastServerRowsRef = useRef<ClaimedHexRow[]>([]);
  const localPaintTimer = useRef<number | null>(null);
  const moveRefreshTimer = useRef<number | null>(null);
  // Bumped to build the map again after its worker failed to load. Once.
  const [mapAttempt, setMapAttempt] = useState(0);
  const workerRetriedRef = useRef(false);
  // Until when the server asked not to be asked for blocks, and when the
  // near disk was last downloaded. See lib/map/refreshBackoff.
  const serverBackoffUntil = useRef(0);
  const lastDiskFetchAt = useRef(0);
  // What the map did since the run started; sent with run_finished.
  const mapStatsRef = useRef(newMapRunStats());
  // Whether the camera keeps the player in the middle. A drag turns it off,
  // the centre button turns it back on.
  const followRef = useRef(true);
  const [following, setFollowing] = useState(true);
  // Which way is up: north, or the direction of travel. The player's
  // choice, kept between visits.
  const orientationRef = useRef<MapOrientation>("north");
  const [orientation, setOrientation] = useState<MapOrientation>("north");
  const courseRef = useRef<CourseState>({ anchor: null, course: null });
  useEffect(() => {
    const saved = readOrientation();
    if (saved === "north") return;
    orientationRef.current = saved;
    queueMicrotask(() => setOrientation(saved));
  }, []);
  const toggleOrientation = useCallback(() => {
    const next: MapOrientation =
      orientationRef.current === "north" ? "heading" : "north";
    orientationRef.current = next;
    setOrientation(next);
    writeOrientation(next);
    track("map_orientation_set", { mode: next });
    const map = mapRef.current;
    if (!map) return;
    try {
      if (next === "north") {
        map.easeTo({ bearing: 0, duration: 400 });
        return;
      }
      // Turning the map to the way the player is going only makes sense
      // around the player, so this also takes the camera back to them.
      if (!followRef.current) {
        trackLimited(
          "map_follow_set",
          {
            is_following: true,
            reason: "orientation",
            in_run: runIdRef.current !== null,
          },
          10,
        );
      }
      followRef.current = true;
      setFollowing(true);
      const pos = latestPosRef.current;
      const course = courseRef.current.course;
      map.easeTo({
        ...(pos ? { center: [pos.lng, pos.lat] as [number, number] } : {}),
        ...(course !== null ? { bearing: course } : {}),
        duration: 400,
      });
    } catch (e) {
      log.debug("orientation change skipped", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  // Set when the last few fixes were all too coarse to capture.
  const [weakAccuracyM, setWeakAccuracyM] = useState<number | null>(null);
  const coarseStreakRef = useRef(0);
  const [geoLastError, setGeoLastError] = useState<string | null>(null);
  const [geoPriorPermission, setGeoPriorPermission] = useState<string | null>(
    null,
  );
  const [runId, setRunId] = useState<string | null>(null);
  const [hexCount, setHexCount] = useState(0);
  // What the capture status line is built from. See lib/runs/captureStatus.
  const [pendingCount, setPendingCount] = useState(0);
  // The last upload failed and the queue is waiting on a retry.
  const [uploadFailing, setUploadFailing] = useState(false);
  const [fixReady, setFixReady] = useState(false);
  const [startedOnOwned, setStartedOnOwned] = useState(false);
  const [repeatedCount, setRepeatedCount] = useState(0);
  // Accuracy of the latest fix, in 5 m steps so a jittering GPS does not
  // re-render the screen on every reading.
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  // Floating "+1" chips, one per kind of action in a server answer.
  const [bursts, setBursts] = useState<CaptureBurst[]>([]);
  const burstIdRef = useRef(0);
  const fixReadyRef = useRef(false);
  useEffect(() => {
    fixReadyRef.current = fixReady;
  }, [fixReady]);
  const [reinforcedCount, setReinforcedCount] = useState(0);
  const [attackedCount, setAttackedCount] = useState(0);
  const [stolenCount, setStolenCount] = useState(0);
  const stolenRef = useRef(0);
  const capture = captureStatus({
    pending: pendingCount,
    saved: hexCount,
    acted: reinforcedCount + attackedCount,
    repeated: repeatedCount,
    fixReady,
    startedOnOwned,
    uploadFailing,
  });
  // The finish handler reads it without being rebuilt on every change.
  const captureStatusRef = useRef(capture.kind);
  useEffect(() => {
    captureStatusRef.current = capture.kind;
  }, [capture.kind]);
  // A run that has gone GPS_STUCK_AFTER_MS without an accurate fix gets a
  // banner with what to do: the status line alone left players walking for
  // minutes and capturing nothing (lib/runs/runSummaryCopy).
  const [gpsStuck, setGpsStuck] = useState(false);
  // A run started with "Start anyway" already waited for a fix and got none,
  // so its banner comes up at once: 52% of those runs end with no blocks,
  // against 14% of runs started with a fix (7 days to 17 Nov 2026).
  const [startedBlind, setStartedBlind] = useState(false);
  const searchingInRun = !!runId && capture.kind === "searching";
  useEffect(() => {
    if (!searchingInRun) return;
    const wait = startedBlind ? 0 : GPS_STUCK_AFTER_MS;
    const timer = window.setTimeout(() => {
      setGpsStuck(true);
      track("run_gps_stuck_shown", { after_sec: Math.round(wait / 1000) });
    }, wait);
    return () => {
      window.clearTimeout(timer);
      setGpsStuck(false);
    };
  }, [searchingInRun, startedBlind]);
  // Before Start: whether the block under the player will count
  // (lib/runs/runSummaryCopy startSpot). Read from refs, so it is refreshed
  // where they change: a new block underfoot, the used-today list arriving,
  // and a run ending.
  const [spot, setSpot] = useState<"used" | "owned" | null>(null);
  const refreshSpot = useCallback(() => {
    setSpot(
      startSpot({
        here: currentHexRef.current,
        strength: HEX_STRENGTH,
        usedToday: usedTodayRef.current,
        mine: mineH3Ref.current,
      }),
    );
  }, []);
  const spotRef = useRef<"used" | "owned" | null>(null);
  useEffect(() => {
    spotRef.current = spot;
    if (spot && !runId) track("start_spot_hint_shown", { kind: spot });
  }, [spot, runId]);
  // The server stopped capturing because this "on foot" run moves at vehicle
  // speed (too-fast-on-foot). Shown until 45 s pass without another one.
  const [footTooFast, setFootTooFast] = useState(false);
  const [claimRefused, setClaimRefused] = useState(false);
  // Treasures this run won, shown with a one-tap claim.
  const [foundTreasures, setFoundTreasures] = useState<FoundTreasure[]>([]);
  const footTooFastTimer = useRef<number | null>(null);
  const modeWarnedRef = useRef(false);
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
    hexesStolen: number;
    distanceMeters: number;
    serverDistanceMeters: number;
    captureState: string;
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

  useEffect(() => {
    userRef.current = user?.username ?? null;
  }, [user?.username]);

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
      // A glance away of a few seconds (a notification, the wallet sheet)
      // is no different from a normal gap between pings: keep the anchor and
      // let the usual stale-gap rule decide. Dropping it here cost the cells
      // in between even for a 4 s blip at car speed (19 Nov 2026: 58 m).
      const sinceFix =
        lastPosTsRef.current > 0 ? Date.now() - lastPosTsRef.current : Infinity;
      const keep = sinceFix <= GPS_GAP_STALE_SECONDS * 1000;
      // Snapshot the anchor so the next fix can report the actual gap size
      // to analytics.
      if (lastPosRef.current && lastPosTsRef.current > 0) {
        visibilityResetRef.current = {
          ts: lastPosTsRef.current,
          lat: lastPosRef.current.lat,
          lng: lastPosRef.current.lng,
          kept: keep,
        };
      }
      if (keep) {
        void flushClaimQueueRef.current();
        return;
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
    // Only a run this phone started can take its blocks: the server asks for
    // the run's token. A run opened elsewhere (another device, or someone
    // else using this address) is left alone, and the player starts a new one.
    if (!runToken(activeRun.id)) {
      log.warn("active run not resumed: no token on this phone", {
        id: activeRun.id,
      });
      return;
    }
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
  // When the player's own block list last arrived. See shouldFetchOwnList.
  const ownListAtRef = useRef(0);
  const diskCoverRef = useRef<{
    lat: number;
    lng: number;
    radiusM: number;
  } | null>(null);
  const paintGen = useRef(0);
  const worldInflight = useRef<Promise<ClaimedHexRow[] | null> | null>(null);

  /**
   * Which block a dot shows when several share a patch of screen: this
   * run's captures first, then a reinforce, then the player's own, then a
   * top-ten color.
   */
  const dotRank = useCallback((row: PaintRow): number => {
    if (row.pending || runH3Ref.current.has(row.h3)) return 4;
    if (reinforcedH3Ref.current.has(row.h3)) return 3;
    const owner = row.owner.toLowerCase();
    if (linkedRef.current.has(owner)) return 2;
    if (topColorsRef.current.has(owner)) return 1;
    return 0;
  }, []);
  /** Whether the last paint was dots. A change of mode forces a repaint. */
  const paintedDotsRef = useRef(false);

  /**
   * Draw the claimed layer from a set of server rows plus what this phone
   * knows on its own: the player's blocks the answer left out, and the
   * captures still queued. Returns how many blocks went to the map.
   */
  const drawClaimed = useCallback((rows: ClaimedHexRow[]): number => {
    const map = mapRef.current;
    if (!map && !isGridRef.current) return 0;
    // A refresh may add the player's blocks, never take them away. See
    // lib/map/ownFloor for the run this was filmed on.
    const floored = withOwnFloor({
      rows,
      owned: mineH3Ref.current,
      // Derived from the outbox rather than tracked alongside it: the
      // queue already *is* the set of captures the server has not
      // acknowledged, and a second copy would be a second thing to keep
      // correct.
      pending: new Set(claimQueueRef.current.map((q) => q.h3)),
      address: addressRef.current,
      username: userRef.current,
    });
    // Zoomed out, a block is smaller than a pixel: draw one dot per patch
    // of screen instead, on a real block. See lib/map/runDots.
    const dots = map ? map.getZoom() < RUN_DOT_ZOOM : false;
    const shown =
      map && dots ? thinForDots(floored, map.getZoom(), dotRank) : floored;
    const collection = claimedHexesToFeatureCollection(
      shown,
      linkedRef.current,
      runH3Ref.current,
      topColorsRef.current,
      usedTodayRef.current,
      reinforcedH3Ref.current,
      attackedLeftRef.current,
    );
    if (map) {
      paintedDotsRef.current = dots;
      liveGeoSource(map, "claimed-hexes")?.setData(
        dots ? EMPTY_COLLECTION : collection,
      );
      liveGeoSource(map, "claimed-dots")?.setData(
        dots ? toPointCollection(collection) : EMPTY_COLLECTION,
      );
    } else setGridData({ hexes: collection });
    return shown.length;
  }, [dotRank]);

  /**
   * Repaint from what the phone already has, with no request.
   *
   * The pending shade existed, but it was only ever drawn by a refresh, and
   * a refresh runs after the server answers. So a block showed up when the
   * network allowed, not when the player crossed it, and with the upload
   * failing the trail simply stopped (11 Nov 2026, Mumbai: five failed
   * uploads in four minutes and a map that looked stuck). This draws the
   * crossing at the crossing.
   *
   * The server rows are the last ones painted, so another player's block
   * keeps its owner until the server says otherwise: nothing here guesses
   * the outcome of an attack. Coalesced, because at speed the fix handler
   * queues blocks about once a second and each paint rebuilds the layer.
   */
  const paintLocalSoon = useCallback(() => {
    if (localPaintTimer.current !== null) return;
    localPaintTimer.current = window.setTimeout(() => {
      localPaintTimer.current = null;
      drawClaimed(lastServerRowsRef.current);
    }, 250);
  }, [drawClaimed]);

  useEffect(
    () => () => {
      if (localPaintTimer.current !== null) {
        window.clearTimeout(localPaintTimer.current);
        localPaintTimer.current = null;
      }
      if (moveRefreshTimer.current !== null) {
        window.clearTimeout(moveRefreshTimer.current);
        moveRefreshTimer.current = null;
      }
    },
    [],
  );

  const refreshClaimed = useCallback(
    async (reason: RefreshReason = "fresh") => {
      const map = mapRef.current;
      // The grid tier has no map object, so the view comes from the canvas
      // instead. Without this the fetch returned early and the phones that
      // most need their blocks drawn were the ones that never got them.
      const grid = isGridRef.current;
      if (!map && !grid) return;
      const gen = ++paintGen.current;
      let centerLat: number;
      let centerLng: number;
      let radius: number;
      let bounds: LngLatBounds;
      try {
        if (map) {
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
        } else {
          const data = getGridData();
          // Nothing to frame until the first fix; the next one calls again.
          if (!data.position) return;
          const view = viewportFromCenter(data.center, data.zoom, data.size);
          centerLat = view.centerLat;
          centerLng = view.centerLng;
          radius = view.radiusM;
          bounds = view.bounds;
        }
      } catch {
        return;
      }

      const stale = () => paintGen.current !== gen || mapRef.current !== map;
      const paint = (rows: ClaimedHexRow[]) => {
        // `rememberOwners` first: it is what keeps the floor honest, dropping
        // a hex the moment the server says it changed hands. Only then is it
        // safe to draw from that set.
        rememberOwners(mineH3Ref.current, rows, linkedRef.current);
        // In dot mode keep only the rows a dot stands for. The local repaint
        // runs four times a second on a moving run, and it would otherwise
        // walk every block in a view that can hold the whole world list.
        const paintStart = performance.now();
        const zoom = map ? map.getZoom() : null;
        const dots = zoom !== null && zoom < RUN_DOT_ZOOM;
        const kept = dots ? thinForDots(rows, zoom, dotRank) : rows;
        lastServerRowsRef.current = kept;
        const count = drawClaimed(kept);
        const paintMs = performance.now() - paintStart;
        const stats = mapStatsRef.current;
        if (paintMs > stats.slowestPaintMs) stats.slowestPaintMs = paintMs;
        const inRun = runIdRef.current !== null;
        if (dots) {
          stats.dotPaints += 1;
          trackLimited("map_dots_shown", {
            zoom: Math.round(zoom * 10) / 10,
            rows: rows.length,
            dots: count,
            ms: Math.round(paintMs),
            in_run: inRun,
          });
        }
        if (paintMs > 250 && zoom !== null) {
          trackLimited("map_paint_slow", {
            ms: Math.round(paintMs),
            rows: rows.length,
            zoom: Math.round(zoom * 10) / 10,
            is_dots: dots,
            in_run: inRun,
          });
        }
        log.debug("claimed-view", {
          count,
          fromServer: rows.length,
          reason,
          wide,
          grid: !map,
        });
      };
      const fetchRows = async (
        url: string,
      ): Promise<ClaimedHexRow[] | null> => {
        const startedAt = Date.now();
        const stats = mapStatsRef.current;
        // The server asked for a pause: answer from what the phone has. A
        // new screen ("fresh") still asks, once, or it would open empty.
        if (reason !== "fresh" && startedAt < serverBackoffUntil.current) {
          stats.skipped += 1;
          return null;
        }
        stats.refreshes += 1;
        try {
          const res = await fetch(url);
          if (!res.ok) {
            stats.refreshErrors += 1;
            const seconds = backoffSeconds(
              res.status,
              res.headers.get("Retry-After"),
            );
            if (seconds !== null) {
              stats.backoffs += 1;
              serverBackoffUntil.current = Date.now() + seconds * 1000;
              hexRefreshPauseUntil.current = serverBackoffUntil.current;
              trackLimited("hexes_refresh_backoff", {
                status: res.status,
                seconds,
              });
            }
            log.warn("claimed hexes refresh failed", {
              status: res.status,
              backoffSeconds: seconds,
            });
            trackLimited("hexes_refresh_error", { status: res.status }, 10);
            reportServerError(endpointLabel(url), res.status);
            return null;
          }
          return rowsFromWorldResponse(await res.json());
        } catch (e) {
          stats.refreshErrors += 1;
          log.error("failed to refresh claimed hexes", {
            message: e instanceof Error ? e.message : String(e),
          });
          trackLimited("hexes_refresh_network_error", {
            error: e instanceof Error ? e.message : String(e),
            elapsed_ms: Date.now() - startedAt,
            online: navigator.onLine,
          });
          return null;
        }
      };

      const wide = viewportNeedsWorld(radius);
      if (!wide) {
        const cover = diskCoverRef.current;
        // Dots on screen at a zoom that draws blocks, or the reverse: the
        // disk may cover the view, but what is painted is the wrong shape.
        const modeChanged = map
          ? map.getZoom() < RUN_DOT_ZOOM !== paintedDotsRef.current
          : false;
        if (
          reason === "move" &&
          !modeChanged &&
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
        // After a saved batch the map is already patched from the claim's
        // own answer. The download adds what others did nearby, and that
        // does not need a request per batch.
        if (
          reason === "claimed" &&
          !modeChanged &&
          Date.now() - lastDiskFetchAt.current < CLAIMED_REFRESH_MIN_MS
        ) {
          mapStatsRef.current.skipped += 1;
          drawClaimed(lastServerRowsRef.current);
          return;
        }
        const k = diskKForRadius(radius);
        const near = latLngToCell(centerLat, centerLng, HEX_RESOLUTION);
        lastDiskFetchAt.current = Date.now();
        const rows = await fetchRows(`/api/hexes?near=${near}&k=${k}`);
        if (stale()) return;
        if (!rows) {
          // Refused or offline: what is on the phone may still need drawing
          // in the other shape (blocks to dots or back).
          if (modeChanged) drawClaimed(lastServerRowsRef.current);
          return;
        }
        paint(rows);
        diskCoverRef.current = {
          lat: centerLat,
          lng: centerLng,
          radiusM: diskRadiusMeters(k),
        };
        return;
      }

      diskCoverRef.current = null;
      // Read the saved world list only when this screen has none yet. It is
      // 1.2 MB of JSON; reading and placing it again on every pan and every
      // batch also threw away the player's own blocks merged into it, which
      // was harmless only while those were downloaded again each time.
      let cached: Awaited<ReturnType<typeof readCachedWorld>> = null;
      let cachedRows: ClaimedHexRow[] | null = null;
      if (!worldRef.current) {
        cached = await readCachedWorld();
        if (stale()) return;
        cachedRows = cached ? parseWorldBody(cached.body) : null;
      }
      // The player's own blocks, started now and awaited later. This used to
      // run after the world list, which was fine while /community kept the
      // full list warm in IndexedDB. Since 3 Nov /community caches the
      // thinned list under its own key instead, so this branch finds nothing
      // cached and the player watched their own territory disappear for the
      // seconds the 1 MB world list took to arrive. Their own blocks are
      // 56 KB and are the thing they notice missing, so they go first.
      const ownAddr = addressRef.current;
      const fetchMine = async () => {
        const mine = await fetchRows(
          `/api/hexes?owner=${encodeURIComponent(ownAddr ?? "")}`,
        );
        if (mine) ownListAtRef.current = Date.now();
        return mine;
      };
      const mergeMine = (mine: ClaimedHexRow[]) => {
        const placed = placeHexes(mine);
        worldRef.current = worldRef.current
          ? {
              rows: mergeHexes(worldRef.current.rows, placed),
              at: worldRef.current.at,
            }
          : { rows: placed, at: 0 };
      };
      // See shouldFetchOwnList: not after every batch, and not on every pan.
      const minePending =
        ownAddr &&
        shouldFetchOwnList({
          reason,
          haveWorld: !!cachedRows || !!worldRef.current,
          ownAgeMs: Date.now() - ownListAtRef.current,
        })
          ? fetchMine()
          : null;
      if (cachedRows && cached) {
        worldRef.current = { rows: placeHexes(cachedRows), at: cached.savedAt };
        paint(hexesInBounds(worldRef.current.rows, bounds));
      } else if (worldRef.current) {
        paint(hexesInBounds(worldRef.current.rows, bounds));
      } else {
        // Cold phone: show the blocks around the player while the world list
        // downloads, instead of a blank map.
        const near = latLngToCell(centerLat, centerLng, HEX_RESOLUTION);
        const nearby = await fetchRows(
          `/api/hexes?near=${near}&k=${diskKForRadius(radius)}`,
        );
        if (stale()) return;
        if (nearby && !worldRef.current) paint(nearby);
      }
      // Paint the player's own territory as soon as it lands, without waiting
      // for the world.
      if (minePending) {
        const mineFirst = await minePending;
        if (stale()) return;
        if (mineFirst) {
          mergeMine(mineFirst);
          if (worldRef.current)
            paint(hexesInBounds(worldRef.current.rows, bounds));
        }
      }
      const worldStale =
        !worldRef.current ||
        Date.now() - worldRef.current.at > RUN_WORLD_MAX_AGE_MS;
      if (worldStale) {
        // The saved copy carries the ETag. Read before the in-flight check,
        // not inside it: an await between the check and the assignment lets
        // two refreshes both start the 1.2 MB download.
        const saved =
          cached ?? (worldInflight.current ? null : await readCachedWorld());
        if (stale()) return;
        if (!worldInflight.current) {
          const pending = fetchWorldRows(saved).then(
            (result) => result?.rows ?? null,
          );
          worldInflight.current = pending;
          void pending.finally(() => {
            if (worldInflight.current === pending) worldInflight.current = null;
          });
        }
        const all = await worldInflight.current;
        if (stale()) return;
        if (all) {
          worldRef.current = { rows: placeHexes(all), at: Date.now() };
          // The new world list replaced the one the player's blocks were
          // merged into, and it can be a minute behind (the server caches
          // it). Put the player's blocks back from a download made now,
          // after it: an earlier copy would miss a block stolen while the
          // world list was on its way, and the map would hand it back.
          const mine = ownAddr ? await fetchMine() : null;
          if (stale()) return;
          if (mine) mergeMine(mine);
        }
      }
      if (!worldRef.current) return;
      paint(hexesInBounds(worldRef.current.rows, bounds));
    },
    [drawClaimed, dotRank],
  );

  // Load the blocks already spent today, so the map can mark them before
  // the player walks onto one. A failure costs the marks and nothing else:
  // the capture line still says so when a pass is ignored.
  useEffect(() => {
    if (!HEX_STRENGTH || !address) return;
    let cancelled = false;
    void fetch(`/api/users/${address.toLowerCase()}/used-today`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { h3?: unknown } | null) => {
        if (cancelled || !data || !Array.isArray(data.h3)) return;
        for (const h3 of data.h3) {
          if (typeof h3 === "string") usedTodayRef.current.add(h3);
        }
        refreshSpot();
        void refreshClaimed();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, refreshClaimed, refreshSpot]);

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
    const payload = claimPayload(batch, Date.now());
    let outcome: Parameters<typeof applyHttp>[2];
    const claimStartedAt = Date.now();
    try {
      // A dead connection must not hold the queue: see CLAIM_TIMEOUT_MS.
      // By hand, because AbortSignal.timeout is missing on older WebViews
      // and a throw here would look like a network error forever.
      const abort = new AbortController();
      const abortTimer = window.setTimeout(
        () => abort.abort(),
        CLAIM_TIMEOUT_MS,
      );
      let res: Response;
      try {
        res = await fetch(`/api/runs/${id}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...runTokenHeaders(id) },
          body: JSON.stringify(payload),
          signal: abort.signal,
        });
      } finally {
        window.clearTimeout(abortTimer);
      }
      if (res.status === 409) outcome = { kind: "ended" };
      else if (res.status === 403) {
        // This phone does not hold the run's token (it was started on
        // another device, or the app's storage was cleared). Retrying can
        // never succeed, so the batch is dropped like an ended run's.
        outcome = { kind: "ended" };
        log.warn("batch claim refused: run token missing", {
          count: batch.length,
        });
        track("batch_claim_error", { status: 403, count: batch.length });
        // Unless this tab is simply older than the server: then the batch
        // is kept and the tab moves onto the live build, where the run
        // resumes with its token. See lib/runs/staleClient.ts.
        const mine = process.env.NEXT_PUBLIC_SENTRY_RELEASE;
        const live = await liveBuild();
        if (live && buildDiffers(mine, live)) {
          outcome = { kind: "retry" };
          if (claimReload(window.sessionStorage, live)) {
            track("stale_client_reload", {
              from: String(mine).slice(0, 7),
              to: live.slice(0, 7),
            });
            writeClaimQueue(id, claimQueueRef.current);
            window.location.reload();
          }
        } else {
          // Nothing will get through on this run. Say so, or the player
          // keeps moving for blocks that are thrown away.
          setClaimRefused(true);
          track("run_claim_refused", { has_token: runToken(id) !== null });
        }
      } else if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as {
          retryAfter?: number;
        };
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
        log.warn("batch claim failed", {
          status: res.status,
          count: batch.length,
        });
        track("batch_claim_error", { status: res.status, count: batch.length });
        reportServerError("/api/runs/:id/claim", res.status);
      } else {
        const data = (await res.json()) as {
          results: ClaimResultRow[];
          drops?: FoundTreasure[];
        };
        outcome = { kind: "ok", results: data.results ?? [] };
        if (Array.isArray(data.drops) && data.drops.length > 0) {
          const won = data.drops;
          for (const d of won) {
            track("drop_found", {
              drop_id: d.dropId,
              token: d.token,
              amount: d.amount,
            });
          }
          setFoundTreasures((prev) => [
            ...prev,
            ...won.filter((d) => !prev.some((p) => p.dropId === d.dropId)),
          ]);
        }
        let footRejected = 0;
        let modeRejected = 0;
        // What this answer changed, written into the rows the phone holds
        // once the loop is done. See patchRows.
        const changes = new Map<string, RowChange>();
        const me = addressRef.current?.toLowerCase() ?? null;
        for (const row of outcome.results) {
          if (!row.h3) continue;
          if (row.rejected) {
            if (row.rejected.reason === "too-fast-on-foot") footRejected += 1;
            else if (row.rejected.reason === "too-fast-for-mode")
              modeRejected += 1;
            // Not counted: crossing it again later this run may still count.
            passedH3Ref.current.delete(row.h3);
            continue;
          }
          // Any answer with an action means today's turn on this block is
          // spent, "repeat" included: that one says it already was.
          if (row.action) usedTodayRef.current.add(row.h3);
          const view = claimRowView(row);
          if (view.ownedAfter) mineH3Ref.current.add(row.h3);
          else mineH3Ref.current.delete(row.h3);
          if (view.captured) runH3Ref.current.add(row.h3);
          if (view.reinforced) reinforcedH3Ref.current.add(row.h3);
          if (view.attacked && typeof row.strength === "number") {
            attackedLeftRef.current.set(row.h3, row.strength);
          }
          if (view.captured) attackedLeftRef.current.delete(row.h3);
          const level =
            typeof row.strength === "number" ? { strength: row.strength } : {};
          if (me && (view.captured || view.reinforced)) {
            changes.set(row.h3, {
              owner: me,
              ownerUsername: userRef.current,
              ...level,
            });
          } else if (view.attacked) {
            changes.set(row.h3, level);
          }
        }
        if (changes.size > 0) {
          lastServerRowsRef.current = patchRows(
            lastServerRowsRef.current,
            changes,
            (row) => row,
          );
          if (worldRef.current) {
            worldRef.current = {
              rows: patchRows(
                worldRef.current.rows,
                changes,
                (row) => placeHexes([row])[0],
              ),
              at: worldRef.current.at,
            };
          }
        }
        if (modeRejected > 0 && !modeWarnedRef.current) {
          // A vehicle over its realistic ceiling is almost always a GPS
          // jump, so no banner: the blocks come back once the window passes.
          modeWarnedRef.current = true;
          track("run_mode_too_fast", { rejected: modeRejected });
        }
        if (footRejected > 0) {
          setFootTooFast(true);
          if (footTooFastTimer.current !== null)
            window.clearTimeout(footTooFastTimer.current);
          footTooFastTimer.current = window.setTimeout(
            () => setFootTooFast(false),
            45_000,
          );
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
        elapsed_ms: Date.now() - claimStartedAt,
        online: navigator.onLine,
      });
    }
    // Read before it is reset: an answer that follows a failed upload is
    // carrying a queue, and its number should say so.
    const afterFailure = claimFailuresRef.current > 0;
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
    setPendingCount(applied.items.length);
    setUploadFailing(applied.failures > 0 && applied.items.length > 0);
    claimFlushing.current = false;
    if (applied.reinforced > 0)
      setReinforcedCount((c) => c + applied.reinforced);
    if (applied.attacked > 0) setAttackedCount((c) => c + applied.attacked);
    if (applied.stolen > 0) {
      stolenRef.current += applied.stolen;
      setStolenCount((c) => c + applied.stolen);
    }
    if (applied.repeated > 0) setRepeatedCount((c) => c + applied.repeated);
    // Say what this answer did, where the player is looking.
    const fresh: CaptureBurst[] = [];
    // A block taken from someone gets its own number: it used to be one more
    // "+1" in red, the same as a block nobody held.
    const emptyTaken = applied.newly - applied.stolen;
    if (applied.stolen > 0) {
      fresh.push({
        id: ++burstIdRef.current,
        kind: "stolen",
        count: applied.stolen,
      });
    }
    if (emptyTaken > 0) {
      fresh.push({
        id: ++burstIdRef.current,
        kind: "new",
        count: emptyTaken,
        // A queue that just went through, not one step: label it, or "+20"
        // after a run of "+1" looks like a glitch.
        ...(afterFailure || applied.newly >= LATE_BURST_MIN
          ? { late: true }
          : {}),
      });
    }
    if (applied.reinforced > 0) {
      let level = 0;
      if (outcome.kind === "ok") {
        for (const row of outcome.results) {
          if (row.action === "reinforce" && typeof row.strength === "number") {
            level = Math.max(level, row.strength);
          }
        }
      }
      fresh.push({
        id: ++burstIdRef.current,
        kind: "reinforced",
        count: applied.reinforced,
        ...(level > 0 ? { level } : {}),
      });
    }
    if (applied.attacked > 0) {
      fresh.push({
        id: ++burstIdRef.current,
        kind: "attacked",
        count: applied.attacked,
        ...(applied.attackLeft.length > 0
          ? {
              left: {
                min: Math.min(...applied.attackLeft),
                max: Math.max(...applied.attackLeft),
              },
            }
          : {}),
      });
    }
    if (fresh.length > 0) {
      const ids = new Set(fresh.map((b) => b.id));
      setBursts((cur) => [...cur, ...fresh].slice(-4));
      window.setTimeout(
        () => setBursts((cur) => cur.filter((b) => !ids.has(b.id))),
        1350,
      );
      // A short buzz: the phone is often in a hand or a pocket, not in view.
      try {
        navigator.vibrate?.(applied.newly > 0 ? 40 : 25);
      } catch {
        // Not supported, or blocked by the webview. The chip is enough.
      }
    }
    if (outcome.kind === "ok" && applied.newly > 0)
      setHexCount((c) => c + applied.newly);
    if (
      outcome.kind === "ok" &&
      (applied.newly > 0 || applied.reinforced > 0 || applied.attacked > 0)
    ) {
      await refreshClaimed("claimed");
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
    claimQueueRef.current = addHexes(
      claimQueueRef.current,
      readClaimQueue(runId),
    );
    setPendingCount(claimQueueRef.current.length);
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
      const queuedAt = Date.now();
      claimQueueRef.current = addHexes(
        claimQueueRef.current,
        fresh.map((h3) => ({
          h3,
          distanceMeters: perHexDistance,
          ...(accuracyOk !== undefined ? { accuracy: accuracyOk } : {}),
          at: queuedAt,
        })),
      );
      writeClaimQueue(id, claimQueueRef.current);
      setPendingCount(claimQueueRef.current.length);
      paintLocalSoon();
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
    [flushClaimQueue, paintLocalSoon],
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
        if (claimQueueRef.current.length === 0 && !claimFlushing.current)
          return;
        const wait = Math.max(400, claimRetryMsRef.current);
        const left = deadline - Date.now();
        if (left <= 0) break;
        await new Promise((resolve) =>
          window.setTimeout(resolve, Math.min(wait, left)),
        );
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
      setStartedBlind(!fixReadyRef.current);
      track(
        "run_started",
        {
          ...(declaredModeRef.current ? { mode: declaredModeRef.current } : {}),
          fix_ready: fixReadyRef.current,
          start_hint: spotRef.current ?? "none",
        },
      );
      setRunId(data.id);
      runH3Ref.current = new Set();
      reinforcedH3Ref.current = new Set();
      attackedLeftRef.current = new Map();
      passedH3Ref.current = new Set();
      setUploadFailing(false);
      setHexCount(0);
      setReinforcedCount(0);
      setAttackedCount(0);
      setStolenCount(0);
      stolenRef.current = 0;
      setRepeatedCount(0);
      setDistanceMeters(0);
      setRunStartTime(Date.now());
      setFootTooFast(false);
      setClaimRefused(false);
      footWarnedRef.current = false;
      modeWarnedRef.current = false;
      lastPosRef.current = null;
      distAnchorRef.current = null;
      lastPosTsRef.current = 0;
      pendingDistanceRef.current = 0;
      // Claim the hex we are currently standing in, if any.
      const here = currentHexRef.current;
      // Without hex strength an owned block is not claimed again, so a run
      // that starts on one captures nothing until the player moves. Say so.
      setStartedOnOwned(
        !!here && !HEX_STRENGTH && mineH3Ref.current.has(here),
      );
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

  useEffect(() => {
    topColorsRef.current = topColors;
    if (topColors.size > 0 && mapRef.current?.isStyleLoaded()) {
      void refreshClaimed();
    }
  }, [topColors, refreshClaimed]);

  const finishRun = useCallback(async () => {
    const id = runIdRef.current;
    if (!id) return;
    setIsBusy(true);
    try {
      await drainClaimQueue();
      const extra = Math.round(pendingDistanceRef.current);
      const res = await fetch(`/api/runs/${id}/finish`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...runTokenHeaders(id) },
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
        serverDistanceMeters?: number;
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
        capture_state: captureStatusRef.current,
        distance_m: Math.round(data.distanceMeters),
        speed_kmh:
          durationSec > 0
            ? Math.round((data.distanceMeters / durationSec) * 3.6 * 10) / 10
            : 0,
        move_mode:
          (isMoveMode(data.moveMode)
            ? data.moveMode
            : moveMode(data.distanceMeters, durationSec)) ?? "none",
        ...(HEX_STRENGTH
          ? {
              reinforced: data.hexesReinforced ?? 0,
              damaged: data.hexesDamaged ?? 0,
            }
          : {}),
        ...(mapRef.current
          ? {
              map_orientation: orientationRef.current,
              ...mapRunProps(mapStatsRef.current),
            }
          : {}),
      });
      setLastFinishedRun({
        id,
        durationMs,
        hexesClaimed: data.hexesClaimed,
        hexesReinforced: data.hexesReinforced ?? 0,
        hexesDamaged: data.hexesDamaged ?? 0,
        hexesStolen: stolenRef.current,
        // The larger of the phone's figure and the server's hex path.
        distanceMeters: shownDistanceMeters(
          data.distanceMeters,
          data.serverDistanceMeters,
        ),
        serverDistanceMeters: data.serverDistanceMeters ?? 0,
        captureState: captureStatusRef.current,
        moveMode: isMoveMode(data.moveMode) ? data.moveMode : null,
      });
      // The block under the player has just been used.
      refreshSpot();
      // The card lists the blocks and any badges, then the wallet opens
      // on its own. A decline is not sponsored in that moment.
      setRunId(null);
      declaredModeRef.current = null;
      setDeclaredMode(null);
      // The run's red hexes become ordinary owned (orange) territory, and
      // the green rims go with them.
      runH3Ref.current = new Set();
      reinforcedH3Ref.current = new Set();
      attackedLeftRef.current = new Map();
      setUploadFailing(false);
      passedH3Ref.current = new Set();
      mapStatsRef.current = newMapRunStats();
      if (mapRef.current) noteZoom(mapStatsRef.current, mapRef.current.getZoom());
      // Do not await this. The world list is megabytes, and waiting on it
      // kept the wallet sheet from opening.
      void refreshClaimed();
      setHexCount(0);
      setReinforcedCount(0);
      setAttackedCount(0);
      setStolenCount(0);
      stolenRef.current = 0;
      setDistanceMeters(0);
      setRunStartTime(null);
      lastPosRef.current = null;
      distAnchorRef.current = null;
      lastPosTsRef.current = 0;
      pendingDistanceRef.current = 0;
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
  }, [drainClaimQueue, refreshClaimed, refreshSpot]);

  /**
   * Ask for a position, and on a failure the policy says is worth retrying,
   * ask again with weaker options. See app/run/gpsAttempts.ts: a GPS chip
   * that cannot answer in ten seconds used to lock the player out of the
   * game, with Start greyed out, even when a network fix was a second away.
   */
  const attemptFix = useCallback((options: PositionOptions) => {
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
        const retry = nextFixAttempt(err.code, options);
        log.warn("eager primer failed", {
          code: err.code,
          message: err.message,
          retrying: retry !== null,
        });
        if (retry) {
          // Not a failure yet: the chip could not answer, so ask the towers.
          // The banner stays away, because the player is not stuck.
          track("gps_coarse_retry", { code: err.code });
          attemptFix(retry);
          return;
        }
        geoFailedRef.current = true;
        queueMicrotask(() => {
          setGeoLastError(`${label}: ${err.message}`);
          const next = geoStatusForError(err.code, true);
          if (next) setGeoStatus(next);
        });
      },
      options,
    );
  }, []);

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
    attemptFix(FINE_FIX);
  }, [attemptFix]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The explainer prepares a player for the browser's prompt, so ask the
      // browser first whether there will be one. Already granted and we are
      // explaining nothing; already denied and the explainer is a dead end,
      // because its button calls geolocation and the browser refuses without
      // a word. Both go straight to requestLocation, which either gets a fix
      // or raises the banner that says how to fix it in phone settings.
      const permission = await readGeolocationPermission();
      if (cancelled) return;
      setGeoPriorPermission(permission);
      if (permission === "prompt" || permission === "unknown") {
        if (shouldExplainGps()) {
          gpsExplainOpenRef.current = true;
          setGpsExplain(true);
          track("gps_prompt_shown", { permission });
          return;
        }
      } else {
        // The browser has an answer, so our own flag is redundant from here.
        markGpsAsked();
      }
      track("gps_permission_known", { permission });
      requestLocation();
    })();
    return () => {
      cancelled = true;
    };
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

  // Blocked location is fixed in the phone's settings, which means leaving
  // this screen. When the player comes back, ask once on their behalf: they
  // should not have to find a button to learn that it worked.
  useEffect(() => {
    if (geoStatus !== "denied" && geoStatus !== "unavailable") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") requestLocation();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [geoStatus, requestLocation]);

  useEffect(() => {
    if (!containerRef.current || !mapBoot) return;
    // Wait for the tier. Building MapLibre first and discovering the tier
    // afterwards is how a phone with no WebGL still reached the constructor:
    // the probe resolves in a mount effect, so its value is only in hand on
    // the render after this one.
    if (mapTier === null) return;
    // The grid branch below needs no module; every other tier does.
    if (!isGrid && !gl) return;

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
          if (typeof accuracy === "number" && Number.isFinite(accuracy)) {
            const stepped = Math.max(5, Math.round(accuracy / 5) * 5);
            setAccuracyM((cur) => (cur === stepped ? cur : stepped));
          }
          log.debug("position", { lat: latitude, lng: longitude, accuracy });

          // Always render the live position dot and refresh the "center on
          // me" ref, even if accuracy is poor. The dot is UX (better a rough
          // marker than none), the accuracy gate below is only for hex
          // capture where a wrong-hex claim would corrupt the game.
          latestPosRef.current = { lat: latitude, lng: longitude };
          writeCachedPosition(latitude, longitude);
          if (map) renderPositionDot(map, latitude, longitude);
          // Only a fix good enough to capture with is good enough to steer
          // the map by: a coarse one jumps tens of metres sideways.
          if (!(typeof accuracy === "number" && accuracy > 30)) {
            courseRef.current = nextCourse(courseRef.current, {
              lat: latitude,
              lng: longitude,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
            });
          }

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
              setFixReady(false);
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
          setFixReady(true);

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
              anchor_kept: visReset.kept,
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
            refreshSpot();
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
            }
            // Follow the player: during a run, and whenever the map is
            // turned to the direction of travel. Not while they are looking
            // elsewhere, and not under their fingers.
            const heading = orientationRef.current === "heading";
            if (
              map &&
              (runIdRef.current || heading) &&
              followRef.current &&
              !map.dragPan.isActive() &&
              !map.isZooming()
            ) {
              try {
                const course = heading ? courseRef.current.course : null;
                if (
                  course !== null &&
                  Math.abs(((course - map.getBearing() + 540) % 360) - 180) > 5
                ) {
                  mapStatsRef.current.turns += 1;
                }
                map.easeTo({
                  center: [longitude, latitude],
                  ...(course !== null ? { bearing: course } : {}),
                  duration: 600,
                });
              } catch (e) {
                log.debug("camera follow skipped", {
                  message: e instanceof Error ? e.message : String(e),
                });
              }
            }
          }
          if (map) {
            liveGeoSource(map, "hexes")?.setData(hexes);
          } else if (isGridRef.current) {
            // The grid follows the player directly: there is no camera to
            // animate, so centre and position move together.
            setGridData({
              center: [longitude, latitude],
              position: [longitude, latitude],
            });
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
          queueMicrotask(() =>
            setGeoLastError(`watch ${label}: ${err.message}`),
          );
          const next = geoStatusForError(err.code, firstFix);
          if (next) setGeoStatus(next);
          if (err.code === err.PERMISSION_DENIED) {
            log.warn("geolocation denied");
            return;
          }
          // Once a first fix has arrived, POSITION_UNAVAILABLE (2) and
          // TIMEOUT (3) are typically transient on macOS / mobile. The watch
          // keeps running and recovers on its own, so geoStatusForError
          // returns null and the UI keeps what it was showing.
          log.warn("transient geolocation error", {
            code: err.code,
            message: err.message,
          });
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    };

    // The grid tier never builds a MapLibre map: the canvas is already
    // mounted and tracking is wired the same way the no-WebGL fallback
    // below wires it. Reaching the constructor on a phone with no WebGL is
    // what used to produce the 36 failures those 7 players saw.
    if (isGridRef.current) {
      setGridData({ center: initialCenter, zoom: initialZoom });
      startTracking(null);
      void refreshClaimed();
      return () => {
        alive = false;
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        resetGridData();
      };
    }

    if (!gl) return;
    if (!mapStyle) return;
    const glTier = mapTier === "gl1" ? "gl1" : "gl2";
    mapRenderStarted(glTier, "maplibre", "/run");
    const mapStartedAt =
      typeof performance === "undefined" ? Date.now() : performance.now();
    let map: maplibregl.Map;
    try {
      map = new gl.Map({
        container: containerRef.current,
        style: mapStyle,
        ...lightMapOptions(),
        center: initialCenter,
        zoom: initialZoom,
        minZoom: RUN_MIN_ZOOM,
        // Which way is up is the player's choice, made with the compass
        // button, and the camera turns the map itself. A pinch that also
        // twisted or tilted it left a map nobody had asked for.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: true },
      });
      map.touchZoomRotate.disableRotation();
    } catch (e) {
      // No WebGL at all: the constructor throws. Track without a map.
      log.warn("map init failed; tracking without map", {
        message: e instanceof Error ? e.message : String(e),
      });
      track("map_webgl_failed", { path: "/run" });
      reportWebglFailure("/run");
      // The GPU refused the version this tier was given. Reported as
      // `construct`, which is also what throws the tier away so the next
      // load probes again instead of repeating this.
      mapRenderFailed(glTier, "maplibre", "/run", "construct", e);
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
      foldAttributionLater(map);
      const now =
        typeof performance === "undefined" ? Date.now() : performance.now();
      mapRenderReady(glTier, "maplibre", "/run", now - mapStartedAt);
      map.resize();

      map.addSource("claimed-hexes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      // Red: captured or stolen in this run. Orange: already yours.
      // A top-10 player's own color, else gray: someone else's, yours to
      // take. Higher levels (hex strength) are darker and more solid; rows
      // without a level look like level 1, which is the old look.
      const hasTopColor: maplibregl.ExpressionSpecification = [
        "!=",
        ["coalesce", ["get", "topColor"], ""],
        "",
      ];
      const ownerColor: maplibregl.ExpressionSpecification = [
        "case",
        ["get", "isRun"],
        HEX_COLORS.run,
        ["get", "isReinforced"],
        HEX_COLORS.reinforced,
        ["get", "isMine"],
        levelColor(HEX_COLORS.mine, LEVEL_DARK.mine),
        hasTopColor,
        ["get", "topColor"],
        levelColor(HEX_COLORS.others, LEVEL_DARK.others),
      ];
      map.addLayer({
        id: "claimed-hex-fill",
        type: "fill",
        source: "claimed-hexes",
        paint: {
          "fill-color": ownerColor,
          "fill-opacity": [
            "case",
            // Captured, not saved yet. Half the run shade, so a walk shows up
            // under the player's feet and firms up when the server agrees.
            ["get", "isPending"],
            0.25,
            ["get", "isRun"],
            0.5,
            ["get", "isReinforced"],
            0.55,
            ["get", "isMine"],
            levelValue(0.4, 0.85),
            hasTopColor,
            levelValue(0.35, 0.8),
            levelValue(0.25, 0.6),
          ],
        },
      });
      map.addLayer({
        id: "claimed-hex-line",
        type: "line",
        source: "claimed-hexes",
        paint: {
          "line-color": ownerColor,
          "line-width": levelLineWidth(1.4, 3),
          "line-opacity": [
            "case",
            ["get", "isPending"],
            0.45,
            ["get", "isMine"],
            0.9,
            0.6,
          ],
        },
      });
      // A top-10 player's rank, printed on their blocks. The color alone
      // asked the player to memorise ten of them. Only when the style
      // brought glyphs: the no-basemap fallback has none, and a text layer
      // there would raise the map error it exists to avoid.
      if (map.getStyle()?.glyphs) {
        map.addLayer({
          id: "claimed-hex-rank",
          type: "symbol",
          source: "claimed-hexes",
          minzoom: 16.5,
          // A rank for a top-10 owner, and "×N" on any block of someone
          // else that is above level 1: N passes, on N different days, to
          // take it. Without it a player could not tell a block that falls
          // today from one that needs a week (0xj4an, 14 Nov 2026).
          filter: [
            "any",
            [">", ["get", "topRank"], 0],
            ["all", ["!", ["get", "isMine"]], [">=", ["get", "strength"], 2]],
          ],
          layout: {
            "text-field": [
              "case",
              ["all", [">", ["get", "topRank"], 0], [">=", ["get", "strength"], 2]],
              [
                "format",
                ["to-string", ["get", "topRank"]],
                {},
                "\n",
                {},
                ["concat", "×", ["to-string", ["get", "strength"]]],
                { "font-scale": 0.72 },
              ],
              [">", ["get", "topRank"], 0],
              ["to-string", ["get", "topRank"]],
              ["concat", "×", ["to-string", ["get", "strength"]]],
            ],
            "text-line-height": 1,
            "text-font": ["Noto Sans Bold"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 16.5, 9, 19, 15],
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": [
              "case",
              ["!=", ["get", "topColor"], ""],
              ["get", "topColor"],
              "#52525b",
            ],
            "text-halo-width": 1.5,
          },
        });
      }
      // Attacked in this run: a black rim, the color of the "-1" that
      // popped when it happened, so the player can see which ones they hit.
      map.addLayer({
        id: "claimed-hex-hit",
        type: "line",
        source: "claimed-hexes",
        filter: ["==", ["get", "hitInRun"], true],
        paint: { "line-color": "#18181b", "line-width": 2.5 },
      });
      // Reinforced in this run: green, the fill above and this rim.
      // Thicker than any other outline, and with the dashed white rim below
      // drawn over it (a reinforce spends the block for today), it reads as
      // a pattern and not only as a color.
      map.addLayer({
        id: "claimed-hex-reinforced",
        type: "line",
        source: "claimed-hexes",
        filter: ["==", ["get", "isReinforced"], true],
        paint: {
          "line-color": HEX_COLORS.reinforced,
          "line-width": 4.5,
          "line-opacity": 0.95,
        },
      });
      // Spent for today: a dashed white rim, so the player can tell before
      // walking there that a pass over this block will do nothing.
      map.addLayer({
        id: "claimed-hex-used",
        type: "line",
        source: "claimed-hexes",
        filter: ["==", ["get", "usedToday"], true],
        paint: {
          "line-color": "#ffffff",
          "line-width": 2,
          "line-opacity": 0.95,
          "line-dasharray": [1.2, 1.2],
        },
      });

      // The same blocks as dots, for the zooms where a block is under a
      // pixel. Filled by drawClaimed in place of the polygons.
      map.addSource("claimed-dots", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "claimed-dot",
        type: "circle",
        source: "claimed-dots",
        paint: {
          "circle-color": ownerColor,
          "circle-opacity": ["case", ["get", "isPending"], 0.5, 0.9],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 2.5, 8, 3.5, 14, 4.5],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
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
      // At most one refresh every 4 s, but the last move always gets one.
      // A move inside the pause used to be dropped: pinch out twice in a
      // row and the second view kept the first one's blocks, with the new
      // edges empty until the player touched the map again.
      const refreshAfterMove = () => {
        if (moveRefreshTimer.current !== null) {
          window.clearTimeout(moveRefreshTimer.current);
          moveRefreshTimer.current = null;
        }
        const wait = hexRefreshPauseUntil.current - Date.now();
        if (wait > 0) {
          moveRefreshTimer.current = window.setTimeout(() => {
            moveRefreshTimer.current = null;
            if (alive) refreshAfterMove();
          }, wait);
          return;
        }
        hexRefreshPauseUntil.current = Date.now() + 4_000;
        void refreshClaimed("move");
      };
      map.on("moveend", () => {
        // Blocks to dots or back is a repaint from rows already here when
        // the view is wide, so it does not wait out the pause.
        noteZoom(mapStatsRef.current, map.getZoom());
        const dots = map.getZoom() < RUN_DOT_ZOOM;
        if (dots !== paintedDotsRef.current) hexRefreshPauseUntil.current = 0;
        refreshAfterMove();
      });
      // A drag is the player looking around: stop pulling the camera back
      // to them until they ask for it with the centre button.
      map.on("dragstart", (e) => {
        if (!e.originalEvent) return;
        if (followRef.current) {
          mapStatsRef.current.followBreaks += 1;
          trackLimited(
            "map_follow_set",
            {
              is_following: false,
              reason: "drag",
              in_run: runIdRef.current !== null,
            },
            10,
          );
        }
        followRef.current = false;
        setFollowing(false);
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
          el.appendChild(
            document.createTextNode(` - ${levelLabel} ${props.strength}`),
          );
        }
        popupRef.current = new gl.Popup({
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

    map.on("error", (e) => {
      const message = e.error?.message ?? String(e);
      log.error("map error", { message });
      // The worker is a separate file, and when its download drops the map
      // never draws: the run went on with no map at all (MINIKLAIM-1V and
      // 1R, 3 players). Build the map again, once, which asks for it again.
      if (causeOf(message) === "worker" && !workerRetriedRef.current) {
        workerRetriedRef.current = true;
        log.warn("map worker failed; rebuilding the map once");
        track("map_worker_retry", { path: "/run" });
        queueMicrotask(() => setMapAttempt((n) => n + 1));
        return;
      }
      // The style or its tiles, not the GPU: the tier stays.
      mapRenderFailed(glTier, "maplibre", "/run", "style", e.error ?? e);
    });
    map.on("webglcontextlost", () => mapContextLost(glTier, "/run"));
    // MapLibre rebuilds itself when the context comes back. Counted so a
    // loss that never recovers (a blank map for the rest of the run) can be
    // told from one the player never noticed.
    map.on("webglcontextrestored", () => {
      mapContextRestored(glTier, "/run");
      drawClaimed(lastServerRowsRef.current);
    });

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
    refreshSpot,
    drawClaimed,
    mapAttempt,
    mapBoot,
    mapTier,
    isGrid,
    gl,
    mapStyle,
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
      {/* The same box either way: MapLibre mounts into it, and the grid
          canvas sizes itself from it. */}
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
      >
        {isGrid && <GridMap path="/run" className="block h-full w-full" />}
      </div>
      {/* The grid tier draws a map, so it gets an explanation rather than the
          failure notice: the streets are missing on purpose and the player
          should not be left wondering whether the app is broken. */}
      {isGrid && !mapNoticeClosed && (
        <div className="absolute inset-x-4 top-16 z-20 flex items-start gap-2 rounded-md bg-white/95 p-3 text-sm text-zinc-800 shadow-md">
          <p className="flex-1">{t("map.gridNote")}</p>
          <CloseButton
            onClick={() => {
              setMapNoticeClosed(true);
              mapNoticeDismissed("grid", "/run");
            }}
          />
        </div>
      )}
      {mapUnavailable && !isGrid && !mapNoticeClosed && (
        <div className="absolute inset-x-4 top-16 z-20 flex items-start gap-2 rounded-md bg-white/95 p-3 text-sm text-zinc-800 shadow-md">
          <p className="flex-1">{t("map.webglFailed")}</p>
          <CloseButton
            onClick={() => {
              setMapNoticeClosed(true);
              mapNoticeDismissed(mapTier ?? "gl2", "/run");
            }}
          />
        </div>
      )}
      <Link
        href="/"
        className="mk-tile absolute top-3 left-3 z-10 px-3 py-1.5 text-sm font-semibold text-zinc-900"
      >
        ← {t("common.back")}
      </Link>
      {mounted && address && user?.username && (
        <div className="mk-flat absolute top-3 right-3 z-10 px-3 py-1.5 text-sm text-zinc-700">
          <span>
            <span className="text-zinc-500">@</span>
            <span className="font-medium">{user.username}</span>
          </span>
        </div>
      )}
      {mounted && isActive && (
        <ChallengeRunChip
          address={address ?? null}
          blocks={hexCount}
          stolen={stolenCount}
        />
      )}
      <GeoStatusBanner
        status={geoStatus}
        lastError={geoLastError}
        priorPermission={geoPriorPermission}
        onRetry={retryLocation}
        weakAccuracyM={runId ? weakAccuracyM : null}
      />
      {mapTier !== null && mapTier !== "grid" && !mapUnavailable && (
        <button
          onClick={toggleOrientation}
          aria-label={t(
            orientation === "north"
              ? "run.map.orientation.north"
              : "run.map.orientation.heading",
          )}
          aria-pressed={orientation === "heading"}
          className="mk-tile absolute right-3 z-20 flex h-11 w-11 items-center justify-center text-zinc-800"
          style={
            isActive
              ? {
                  // One button above the centre button, same column.
                  bottom:
                    "calc(max(1.5rem, env(safe-area-inset-bottom)) + 15.25rem)",
                }
              : { bottom: "calc(env(safe-area-inset-bottom) + 21.75rem)" }
          }
        >
          {orientation === "north" ? (
            // A compass needle, north half in the app's orange, with an N.
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <polygon points="12,5 15.5,13 8.5,13" fill="#FF6B35" />
              <polygon points="12,21 15.5,13 8.5,13" fill="#a1a1aa" />
              <text
                x="12"
                y="4.2"
                textAnchor="middle"
                fontSize="5.5"
                fontWeight="700"
                fill="#18181b"
              >
                N
              </text>
            </svg>
          ) : (
            // The arrow navigation apps use for "the way I am going".
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <polygon
                points="12,2.5 19.5,20.5 12,16.5 4.5,20.5"
                fill="#FF6B35"
                stroke="#FF6B35"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      )}
      <button
        onClick={() => {
          const pos = latestPosRef.current;
          const map = mapRef.current;
          if (!pos || !map) return;
          if (!followRef.current) {
            trackLimited(
              "map_follow_set",
              {
                is_following: true,
                reason: "center",
                in_run: runIdRef.current !== null,
              },
              10,
            );
          }
          followRef.current = true;
          setFollowing(true);
          placeCamera(map, pos.lng, pos.lat, FOLLOW_ZOOM);
        }}
        aria-label={t("run.map.center")}
        // Orange while the camera is not following: the player moved the
        // map away, and this is the way back.
        className={`mk-tile absolute right-3 z-20 flex h-11 w-11 items-center justify-center ${
          following ? "text-zinc-800" : "text-orange-700"
        }`}
        style={
          isActive
            ? {
                // Above the run stack (finish button, counter, capture
                // line), not beside it: at 8rem this button sat on the
                // counter's corner whenever the counter had three numbers.
                bottom:
                  "calc(max(1.5rem, env(safe-area-inset-bottom)) + 12rem)",
              }
            : { bottom: "calc(env(safe-area-inset-bottom) + 18.5rem)" }
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
      {foundTreasures.length === 0 && (
        <TreasureHeat
          runId={runId}
          currentCell={() => {
            const pos = latestPosRef.current;
            return pos ? latLngToCell(pos.lat, pos.lng, 12) : null;
          }}
        />
      )}
      <TreasureFound
        address={address ?? null}
        found={foundTreasures}
        onClose={() => setFoundTreasures([])}
      />
      {runId && footTooFast && (
        <div
          role="status"
          className="absolute top-16 right-4 left-4 z-20 rounded-md border border-red-300 bg-red-50 p-3 text-center text-xs font-medium text-red-900 shadow-md"
        >
          {t("run.footTooFast")}
        </div>
      )}
      {runId && gpsStuck && !footTooFast && !claimRefused && (
        <div
          role="alert"
          className="absolute top-16 right-4 left-4 z-20 rounded-md border border-amber-300 bg-amber-50 p-3 text-center text-xs font-medium text-amber-900 shadow-md"
        >
          {t("run.gps.stuck")}
        </div>
      )}
      {runId && claimRefused && (
        <div
          role="alert"
          className="absolute top-16 right-4 left-4 z-20 rounded-md border border-red-300 bg-red-50 p-3 text-center text-xs font-medium text-red-900 shadow-md"
        >
          {t("run.claimRefused")}
        </div>
      )}
      <RunControls
        canStart={!!canStart}
        locationReady={geoStatus === "granted"}
        geoStatus={geoStatus}
        fixReady={fixReady}
        accuracyM={accuracyM}
        isActive={isActive}
        isBusy={isBusy}
        hexCount={hexCount}
        capture={capture}
        stolenCount={stolenCount}
        reinforcedCount={reinforcedCount}
        attackedCount={attackedCount}
        distanceMeters={distanceMeters}
        runStartTime={runStartTime}
        onStart={startRun}
        onFinish={finishRun}
        mode={declaredMode}
        onModeChange={pickMode}
        startSpot={spot}
      />
      {isActive && <CaptureBursts bursts={bursts} />}
      {!isActive && !gpsExplain && !lastFinishedRun && (
        <MapLegend strength={HEX_STRENGTH} />
      )}
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
            // The outcome, not a boolean: the summary says who paid, and
            // only the claim knows whether the relayer did.
            return outcome;
          }}
        />
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
