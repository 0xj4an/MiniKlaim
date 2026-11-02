import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probeGpuSupport = vi.fn();
vi.mock("@/lib/map/gpuSupport", () => ({
  probeGpuSupport: () => probeGpuSupport(),
}));

import {
  forgetMapTier,
  overrideFromSearch,
  resetTierMemo,
  resolveMapTier,
  tierForSupport,
  TIER_STORAGE_KEY,
  TIER_TTL_MS,
} from "./tier";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    raw: map,
  };
}

let storage: ReturnType<typeof fakeStorage>;

function installWindow(store: unknown = storage) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: store, location: { search: "" } },
  });
}

const NOW = 1_762_000_000_000;

describe("tierForSupport", () => {
  it("sends WebGL2 to the current major", () => {
    expect(tierForSupport({ webgl: 2, renderer: null, maxTextureSize: null })).toEqual({
      tier: "gl2",
      reason: "webgl2",
    });
  });

  it("keeps a WebGL1 phone on a renderer that still supports it", () => {
    expect(tierForSupport({ webgl: 1, renderer: "Mali-400 MP", maxTextureSize: 4096 })).toEqual({
      tier: "gl1",
      reason: "webgl1-only",
    });
  });

  it("gives a phone with no WebGL the no-GPU grid", () => {
    expect(tierForSupport({ webgl: 0, renderer: null, maxTextureSize: null })).toEqual({
      tier: "grid",
      reason: "no-webgl",
    });
  });
});

describe("overrideFromSearch", () => {
  it("takes a tier named in the query", () => {
    expect(overrideFromSearch("?maptier=grid")).toBe("grid");
  });

  it("ignores anything that is not a tier", () => {
    expect(overrideFromSearch("?maptier=potato")).toBeNull();
    expect(overrideFromSearch("")).toBeNull();
  });
});

describe("resolveMapTier", () => {
  beforeEach(() => {
    storage = fakeStorage();
    installWindow();
    resetTierMemo();
    probeGpuSupport.mockReset();
    probeGpuSupport.mockReturnValue({
      webgl: 1,
      renderer: "Mali-400 MP",
      maxTextureSize: 4096,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("probes once and then answers from memory", () => {
    const a = resolveMapTier({ now: NOW });
    const b = resolveMapTier({ now: NOW });
    expect(a).toBe(b);
    expect(a.tier).toBe("gl1");
    expect(a.source).toBe("probe");
    expect(probeGpuSupport).toHaveBeenCalledTimes(1);
  });

  it("remembers the decision for the next page load", () => {
    resolveMapTier({ now: NOW });
    resetTierMemo();
    const again = resolveMapTier({ now: NOW + 60_000 });
    expect(again.source).toBe("cache");
    expect(again.tier).toBe("gl1");
    expect(probeGpuSupport).toHaveBeenCalledTimes(1);
  });

  it("re-probes once the remembered answer is a week old", () => {
    // A phone gains WebGL2 by updating Android System WebView. Without this
    // it would stay on the grid until it cleared its own site data.
    resolveMapTier({ now: NOW });
    resetTierMemo();
    probeGpuSupport.mockReturnValue({ webgl: 2, renderer: "Adreno", maxTextureSize: 8192 });
    const later = resolveMapTier({ now: NOW + TIER_TTL_MS + 1 });
    expect(later.source).toBe("probe");
    expect(later.tier).toBe("gl2");
  });

  it("re-probes when the build that decided it is gone", () => {
    storage.raw.set(
      TIER_STORAGE_KEY,
      JSON.stringify({ tier: "grid", webgl: 0, decidedAt: NOW, build: "some-older-build" }),
    );
    const decision = resolveMapTier({ now: NOW });
    expect(decision.source).toBe("probe");
    expect(decision.tier).toBe("gl1");
  });

  it("ignores a decision stamped in the future", () => {
    // A clock that moved backwards would otherwise pin a stale tier for a
    // week of wall time that never arrives.
    storage.raw.set(
      TIER_STORAGE_KEY,
      JSON.stringify({ tier: "grid", webgl: 0, decidedAt: NOW + 86_400_000, build: "dev" }),
    );
    expect(resolveMapTier({ now: NOW }).source).toBe("probe");
  });

  it("ignores stored junk rather than failing the map", () => {
    storage.raw.set(TIER_STORAGE_KEY, "{not json");
    expect(resolveMapTier({ now: NOW }).tier).toBe("gl1");
  });

  it("still decides when storage throws, as in private mode", () => {
    installWindow({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    });
    const decision = resolveMapTier({ now: NOW });
    expect(decision.tier).toBe("gl1");
    expect(decision.source).toBe("probe");
  });

  it("lets a query override stand in for a device nobody owns", () => {
    const decision = resolveMapTier({ now: NOW, search: "?maptier=grid" });
    expect(decision.tier).toBe("grid");
    expect(decision.source).toBe("override");
    expect(probeGpuSupport).not.toHaveBeenCalled();
    // An override is for one page load and must not be written to storage.
    expect(storage.raw.size).toBe(0);
  });

  it("forgets a decision that a map failure proved wrong", () => {
    resolveMapTier({ now: NOW });
    expect(storage.raw.size).toBe(1);
    forgetMapTier();
    expect(storage.raw.size).toBe(0);
    probeGpuSupport.mockReturnValue({ webgl: 0, renderer: null, maxTextureSize: null });
    expect(resolveMapTier({ now: NOW }).tier).toBe("grid");
  });
});
