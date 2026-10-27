import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEO_ERROR, geoStatusForError, markGpsAsked, shouldExplainGps } from "./gpsPrimer";
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

describe("geoStatusForError", () => {
  it("always blames a denial, fix or no fix", () => {
    expect(geoStatusForError(GEO_ERROR.permissionDenied, true)).toBe("denied");
    expect(geoStatusForError(GEO_ERROR.permissionDenied, false)).toBe("denied");
  });

  it("shows the unavailable banner when the first fix never arrives", () => {
    // kamari, 26 Oct: allowed the prompt, the phone answered
    // POSITION_UNAVAILABLE, the page stayed on "requesting" with no banner
    // and no retry, and the ticket read "Can't start a run".
    expect(geoStatusForError(GEO_ERROR.positionUnavailable, true)).toBe("unavailable");
    expect(geoStatusForError(GEO_ERROR.timeout, true)).toBe("timeout");
  });

  it("keeps quiet once the run has a position", () => {
    expect(geoStatusForError(GEO_ERROR.positionUnavailable, false)).toBeNull();
    expect(geoStatusForError(GEO_ERROR.timeout, false)).toBeNull();
  });

  it("ignores codes it does not know", () => {
    expect(geoStatusForError(99, true)).toBeNull();
  });
});
