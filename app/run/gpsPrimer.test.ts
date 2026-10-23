import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markGpsAsked, shouldExplainGps } from "./gpsPrimer";
import { writeCachedPosition } from "./positionCache";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shouldExplainGps", () => {
  it("explains on a fresh device", () => {
    expect(shouldExplainGps()).toBe(true);
  });

  it("stops explaining once the player went through it", () => {
    markGpsAsked();
    expect(shouldExplainGps()).toBe(false);
  });

  it("skips the explainer when the device already had a fix", () => {
    writeCachedPosition(6.25, -75.56);
    expect(shouldExplainGps()).toBe(false);
  });

  it("explains when storage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(shouldExplainGps()).toBe(true);
  });
});
