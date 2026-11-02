"use client";

import * as Sentry from "@sentry/nextjs";
import { track } from "@/lib/analytics";
import { createLogger } from "@/lib/logger";
import { forgetMapTier, resolveMapTier, type MapTier } from "@/lib/map/tier";

const log = createLogger("map");

/**
 * Everything the map rollout is watched through, in one place.
 *
 * Three renderers now serve three groups of phones, and only one of those
 * groups is the team's own. So the question is not whether a map crashes, it
 * is which tier a phone landed in, whether it was probed or remembered, how
 * long the map took, and at which stage it gave up. A crash report alone
 * cannot answer any of those.
 *
 * Both sinks are used on purpose, because they answer different questions.
 * PostHog has the player and the counts, so "what share of phones on gl1
 * never see a map" is a query. Sentry has the stack and the device, so "what
 * exactly threw on this one" is a click. The tier is a Sentry tag rather
 * than only an event property, since a tag can be searched and grouped on,
 * which is what turns an unrelated crash into "all of these are grid".
 */

export type MapEngine = "maplibre" | "grid";
export type FailureStage = "import" | "construct" | "style" | "draw";

let tagged = false;

/**
 * Resolve the tier and stamp it on Sentry, once per page load. Every later
 * error in the session carries it, including errors that have nothing to do
 * with the map: that is the point, because "this only happens on grid" is a
 * conclusion no map-specific event could reach.
 */
export function initMapTelemetry(): MapTier {
  const decision = resolveMapTier();
  if (tagged) return decision.tier;
  tagged = true;

  Sentry.setTag("map.tier", decision.tier);
  Sentry.setTag("map.tier_source", decision.source);
  Sentry.setTag("map.webgl", String(decision.webgl));
  // The GPU string is what driver blacklists key on, so it is the field that
  // explains a whole cluster of reports at once. Null on browsers that treat
  // it as fingerprinting, which is itself worth seeing.
  Sentry.setTag("map.renderer", decision.renderer ?? "unknown");
  Sentry.setContext("map", {
    tier: decision.tier,
    source: decision.source,
    reason: decision.reason,
    webgl: decision.webgl,
    renderer: decision.renderer,
    maxTextureSize: decision.maxTextureSize,
    decidedAt: new Date(decision.decidedAt).toISOString(),
  });

  track("map_tier_resolved", {
    tier: decision.tier,
    source: decision.source,
    reason: decision.reason,
    webgl: decision.webgl,
    renderer: decision.renderer,
    max_texture_size: decision.maxTextureSize,
  });

  return decision.tier;
}

export function mapRenderStarted(
  tier: MapTier,
  engine: MapEngine,
  path: string,
): void {
  Sentry.addBreadcrumb({
    category: "map",
    level: "info",
    message: `render started on ${engine}`,
    data: { tier, engine, path },
  });
}

export function mapRenderReady(
  tier: MapTier,
  engine: MapEngine,
  path: string,
  ms: number,
): void {
  Sentry.addBreadcrumb({
    category: "map",
    level: "info",
    message: `render ready in ${Math.round(ms)}ms`,
    data: { tier, engine, path },
  });
  track("map_render_ready", { tier, engine, path, ms: Math.round(ms) });
}

/**
 * A map that did not draw. The stage matters more than the message: `import`
 * is a bundle or network problem, `construct` is the GPU refusing, `style` is
 * the tile host, `draw` is a live failure after a working start. Only one of
 * those is a reason to move the player to another tier.
 */
export function mapRenderFailed(
  tier: MapTier,
  engine: MapEngine,
  path: string,
  stage: FailureStage,
  error: unknown,
): void {
  const message = messageOf(error);
  log.error("map render failed", { tier, engine, path, stage, message });

  track("map_render_failed", {
    tier,
    engine,
    path,
    stage,
    message: message.slice(0, 200),
  });

  Sentry.withScope((scope) => {
    scope.setTag("map.stage", stage);
    scope.setTag("map.engine", engine);
    // One issue per tier and stage. Without this the grid's failures group
    // with maplibre's and the tier the fix belongs to is lost in the mix.
    scope.setFingerprint(["map-render-failed", tier, engine, stage]);
    scope.setContext("mapFailure", { tier, engine, path, stage, message });
    Sentry.captureException(
      error instanceof Error ? error : new Error(message),
    );
  });

  // A GPU that refused to build the map contradicts the tier it was given.
  // Keeping that answer for a week would repeat the failure on every load,
  // and the player cannot clear it themselves.
  if (stage === "construct" && tier !== "grid") {
    track("map_tier_forgotten", { tier, reason: `construct-failed-${engine}` });
    forgetMapTier();
  }
}

export function mapContextLost(tier: MapTier, path: string): void {
  Sentry.addBreadcrumb({
    category: "map",
    level: "warning",
    message: "webgl context lost",
    data: { tier, path },
  });
  track("map_context_lost", { tier, path });
}

export function mapNoticeDismissed(tier: MapTier, path: string): void {
  track("map_notice_dismissed", { tier, path });
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error).slice(0, 200);
  } catch {
    return "unknown error";
  }
}

/** Test seam: allow the Sentry tags to be set again. */
export function resetMapTelemetry(): void {
  tagged = false;
}
