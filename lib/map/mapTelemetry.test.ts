import { beforeEach, describe, expect, it, vi } from "vitest";

const setTag = vi.fn();
const setContext = vi.fn();
const addBreadcrumb = vi.fn();
const captureException = vi.fn();
const scope = {
  setTag: vi.fn(),
  setFingerprint: vi.fn(),
  setContext: vi.fn(),
};
vi.mock("@sentry/nextjs", () => ({
  setTag: (...a: unknown[]) => setTag(...a),
  setContext: (...a: unknown[]) => setContext(...a),
  addBreadcrumb: (...a: unknown[]) => addBreadcrumb(...a),
  captureException: (...a: unknown[]) => captureException(...a),
  withScope: (fn: (s: typeof scope) => void) => fn(scope),
}));

const track = vi.fn();
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

const forgetMapTier = vi.fn();
const resolveMapTier = vi.fn();
vi.mock("@/lib/map/tier", () => ({
  forgetMapTier: () => forgetMapTier(),
  resolveMapTier: () => resolveMapTier(),
}));

import {
  initMapTelemetry,
  mapRenderFailed,
  mapRenderReady,
  messageOf,
  resetMapTelemetry,
} from "./mapTelemetry";

const decision = {
  tier: "gl1" as const,
  webgl: 1 as const,
  renderer: "Mali-400 MP",
  maxTextureSize: 4096,
  source: "probe" as const,
  reason: "webgl1-only",
  decidedAt: 1_762_000_000_000,
};

describe("initMapTelemetry", () => {
  beforeEach(() => {
    resetMapTelemetry();
    [setTag, setContext, addBreadcrumb, captureException, track, forgetMapTier].forEach((m) =>
      m.mockReset(),
    );
    resolveMapTier.mockReset();
    resolveMapTier.mockReturnValue(decision);
  });

  it("tags the tier on Sentry so an unrelated crash can be grouped by it", () => {
    expect(initMapTelemetry()).toBe("gl1");
    expect(setTag).toHaveBeenCalledWith("map.tier", "gl1");
    expect(setTag).toHaveBeenCalledWith("map.tier_source", "probe");
    expect(setTag).toHaveBeenCalledWith("map.renderer", "Mali-400 MP");
  });

  it("says unknown rather than nothing when the GPU string is withheld", () => {
    resolveMapTier.mockReturnValue({ ...decision, renderer: null });
    initMapTelemetry();
    expect(setTag).toHaveBeenCalledWith("map.renderer", "unknown");
  });

  it("reports the tier once per page load", () => {
    initMapTelemetry();
    initMapTelemetry();
    expect(track.mock.calls.filter((c) => c[0] === "map_tier_resolved")).toHaveLength(1);
  });
});

describe("mapRenderFailed", () => {
  beforeEach(() => {
    [track, captureException, forgetMapTier].forEach((m) => m.mockReset());
    [scope.setTag, scope.setFingerprint, scope.setContext].forEach((m) => m.mockReset());
  });

  it("keeps each tier, stage and cause as its own Sentry issue", () => {
    mapRenderFailed("grid", "grid", "/run", "draw", new Error("canvas gone"));
    expect(scope.setFingerprint).toHaveBeenCalledWith([
      "map-render-failed",
      "grid",
      "grid",
      "draw",
      "other",
    ]);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("splits the worker from the tile host, which share the style stage", () => {
    // They shared MINIKLAIM-1R, so its title flipped between them and a
    // worker error was read, and chased, as a tile host problem.
    mapRenderFailed(
      "gl2",
      "maplibre",
      "/run",
      "style",
      new Error("Worker failed to load. Check that the worker URL is correct."),
    );
    const worker = scope.setFingerprint.mock.calls.at(-1)?.[0];
    expect(worker).toEqual([
      "map-render-failed",
      "gl2",
      "maplibre",
      "style",
      "worker",
    ]);
    expect(scope.setTag).toHaveBeenCalledWith("map.cause", "worker");
  });

  it("puts the cause on the counted event too, not only on Sentry", () => {
    // A style request that never completed stays out of Sentry, so the
    // breakdown of what is failing has to live in the analytics event.
    mapRenderFailed(
      "gl2",
      "maplibre",
      "/community",
      "style",
      new Error("AJAXError: Failed to fetch (tiles.openfreemap.org) (0)"),
    );
    expect(track).toHaveBeenCalledWith(
      "map_render_failed",
      expect.objectContaining({ cause: "tiles", stage: "style" }),
    );
  });

  it("throws away a tier whose GPU refused to build the map", () => {
    // Otherwise the remembered answer repeats the failure for a week and the
    // player has no way to clear it.
    mapRenderFailed("gl1", "maplibre", "/run", "construct", new Error("WebGL not supported"));
    expect(forgetMapTier).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("map_tier_forgotten", {
      tier: "gl1",
      reason: "construct-failed-maplibre",
    });
  });

  it("keeps the tier when the tile host failed, which is not the GPU", () => {
    mapRenderFailed("gl2", "maplibre", "/community", "style", new Error("502"));
    expect(forgetMapTier).not.toHaveBeenCalled();
  });

  it("keeps the grid, since there is no lower tier to fall to", () => {
    mapRenderFailed("grid", "grid", "/run", "construct", new Error("no 2d context"));
    expect(forgetMapTier).not.toHaveBeenCalled();
  });
});

describe("mapRenderReady", () => {
  beforeEach(() => track.mockReset());

  it("rounds the time, because a fraction of a millisecond is noise", () => {
    mapRenderReady("gl2", "maplibre", "/run", 812.4);
    expect(track).toHaveBeenCalledWith("map_render_ready", {
      tier: "gl2",
      engine: "maplibre",
      path: "/run",
      ms: 812,
    });
  });
});

describe("messageOf", () => {
  it("falls back to the name when an Error carries no message", () => {
    expect(messageOf(new TypeError())).toBe("TypeError");
  });

  it("survives something that is not an error at all", () => {
    expect(messageOf({ nope: 1 })).toBe('{"nope":1}');
    expect(messageOf(undefined)).toBe("unknown error");
  });
});
