"use client";

import {
  probeGpuSupport,
  type GpuSupport,
  type WebglLevel,
} from "@/lib/map/gpuSupport";

/**
 * Which renderer a phone gets, decided once and remembered.
 *
 * Three tiers, because the players split three ways and the measurement says
 * all three groups actually play:
 *
 *   gl2   WebGL2, 1,473 players over 14 days. MapLibre, current major.
 *   gl1   WebGL1 only, 27 players, 40 runs, zero map failures. Their map
 *         works today and MapLibre 6 would refuse to build it, so they keep
 *         the last major that supports WebGL1.
 *   grid  No WebGL at all, 7 players, 39 runs and 36 map failures in the same
 *         30 days. They have been running blind. No GPU is involved in this
 *         tier: hexes and position are drawn on a 2D canvas.
 *
 * The decision is cached because probing costs a WebGL context on exactly the
 * phones least able to spare one, and because every map page would otherwise
 * repeat it. It is cached with an expiry and with the build that wrote it, so
 * a player who updates Android System WebView, or a build that changes what
 * the tiers mean, is re-probed instead of being held on `grid` forever. That
 * was the trap worth designing around: a sticky wrong answer is worse than no
 * cache, since the player cannot clear it and would never know why.
 */
export type MapTier = "gl2" | "gl1" | "grid";

export type TierDecision = {
  tier: MapTier;
  webgl: WebglLevel;
  renderer: string | null;
  maxTextureSize: number | null;
  /** Where the tier came from, which is the first thing to ask of a report. */
  source: "probe" | "cache" | "override";
  /** Why this tier and not a better one, for a player report with no numbers. */
  reason: string;
  decidedAt: number;
};

export const TIER_STORAGE_KEY = "mk.map.tier.v1";

/**
 * Re-probe weekly. A WebView or driver update is the realistic way a phone
 * gains WebGL2, and a week is short enough that such a player is not stuck
 * for long, yet long enough that the probe is not a per-session cost.
 */
export const TIER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Stored = {
  tier: MapTier;
  webgl: WebglLevel;
  renderer: string | null;
  maxTextureSize: number | null;
  reason: string;
  decidedAt: number;
  build: string;
};

export function tierForSupport(support: GpuSupport): {
  tier: MapTier;
  reason: string;
} {
  if (support.webgl === 2) return { tier: "gl2", reason: "webgl2" };
  if (support.webgl === 1) return { tier: "gl1", reason: "webgl1-only" };
  return { tier: "grid", reason: "no-webgl" };
}

/** The build that decided a tier, so a release can invalidate the cache. */
function currentBuild(): string {
  return process.env.NEXT_PUBLIC_SENTRY_RELEASE || "dev";
}

function readStored(now: number, build: string): Stored | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(TIER_STORAGE_KEY);
  } catch {
    // Private mode, blocked storage, or a quota error. Probing again is the
    // correct fallback, so there is nothing to handle.
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const s = parsed as Partial<Stored>;
  if (s.tier !== "gl2" && s.tier !== "gl1" && s.tier !== "grid") return null;
  if (typeof s.decidedAt !== "number" || !Number.isFinite(s.decidedAt))
    return null;
  // A clock that moved backwards would otherwise pin a stale decision for a
  // week of wall time that never passes.
  if (s.decidedAt > now) return null;
  if (now - s.decidedAt > TIER_TTL_MS) return null;
  if (s.build !== build) return null;

  return {
    tier: s.tier,
    webgl: s.webgl === 2 || s.webgl === 1 ? s.webgl : 0,
    renderer: typeof s.renderer === "string" ? s.renderer : null,
    maxTextureSize:
      typeof s.maxTextureSize === "number" ? s.maxTextureSize : null,
    reason: typeof s.reason === "string" ? s.reason : "cached",
    decidedAt: s.decidedAt,
    build,
  };
}

function write(decision: TierDecision, build: string): void {
  const stored: Stored = {
    tier: decision.tier,
    webgl: decision.webgl,
    renderer: decision.renderer,
    maxTextureSize: decision.maxTextureSize,
    reason: decision.reason,
    decidedAt: decision.decidedAt,
    build,
  };
  try {
    window.localStorage.setItem(TIER_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Not being able to remember costs one probe per page load, which is the
    // behaviour before this cache existed. Never worth failing a map over.
  }
}

/**
 * A tier forced by `?maptier=grid`, so the grid can be opened on a phone that
 * does not need it. This is how a player report gets reproduced, and how the
 * tier nobody on the team owns a device for gets looked at at all.
 */
export function overrideFromSearch(search: string): MapTier | null {
  const value = new URLSearchParams(search).get("maptier");
  return value === "gl2" || value === "gl1" || value === "grid" ? value : null;
}

let decided: TierDecision | null = null;

/**
 * The tier for this page load. Resolved once per process and then returned
 * from memory, so every map on the page agrees with every other.
 */
export function resolveMapTier(
  options: { now?: number; search?: string } = {},
): TierDecision {
  if (decided) return decided;

  const now = options.now ?? Date.now();
  const search =
    options.search ??
    (typeof window === "undefined" ? "" : window.location.search);

  const override = overrideFromSearch(search);
  if (override) {
    decided = {
      tier: override,
      webgl: override === "gl2" ? 2 : override === "gl1" ? 1 : 0,
      renderer: null,
      maxTextureSize: null,
      source: "override",
      reason: "query-override",
      decidedAt: now,
    };
    return decided;
  }

  const build = currentBuild();
  const cached = readStored(now, build);
  if (cached) {
    decided = { ...cached, source: "cache" };
    return decided;
  }

  const support = probeGpuSupport();
  const { tier, reason } = tierForSupport(support);
  decided = {
    tier,
    webgl: support.webgl,
    renderer: support.renderer,
    maxTextureSize: support.maxTextureSize,
    source: "probe",
    reason,
    decidedAt: now,
  };
  write(decided, build);
  return decided;
}

/**
 * Drop the remembered tier and decide again on the next call. Used when a map
 * fails in a way the tier did not predict: the stored answer has been proven
 * wrong, so keeping it for a week would repeat the failure.
 */
export function forgetMapTier(): void {
  decided = null;
  try {
    window.localStorage.removeItem(TIER_STORAGE_KEY);
  } catch {
    // Nothing to do; the in-memory decision is already cleared.
  }
}

/** Test seam: forget the decision without touching storage. */
export function resetTierMemo(): void {
  decided = null;
}
