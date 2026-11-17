import { describe, expect, it } from "vitest";
import {
  emptyRunReason,
  shareKind,
  shownDistanceMeters,
} from "./runSummaryCopy";

describe("shownDistanceMeters", () => {
  it("takes the server's hex path when the phone dropped distance", () => {
    expect(shownDistanceMeters(0, 165)).toBe(165);
    expect(shownDistanceMeters(107, 12533)).toBe(12533);
  });
  it("keeps the phone's figure when it is the larger one", () => {
    expect(shownDistanceMeters(187, 150)).toBe(187);
  });
  it("is zero for a block captured without moving", () => {
    expect(shownDistanceMeters(0, 0)).toBe(0);
  });
  it("copes with an old server that sends no path, and with junk", () => {
    expect(shownDistanceMeters(42.6, undefined)).toBe(43);
    expect(shownDistanceMeters(Number.NaN, null)).toBe(0);
    expect(shownDistanceMeters(-5, -9)).toBe(0);
  });
});

describe("shareKind", () => {
  it("shares blocks when the run captured any", () => {
    expect(shareKind({ hexesClaimed: 14, badgeCount: 0 })).toBe("blocks");
    expect(shareKind({ hexesClaimed: 1, badgeCount: 2 })).toBe("blocks");
  });
  it("shares the badges, not zero blocks, when only badges were claimed", () => {
    expect(shareKind({ hexesClaimed: 0, badgeCount: 1 })).toBe("badges");
  });
  it("offers nothing to share for an empty run", () => {
    expect(shareKind({ hexesClaimed: 0, badgeCount: 0 })).toBe("none");
  });
});

describe("emptyRunReason", () => {
  it("names what stopped the run from capturing", () => {
    expect(emptyRunReason("searching")).toBe("gps");
    expect(emptyRunReason("repeat")).toBe("repeat");
    expect(emptyRunReason("owned")).toBe("owned");
    expect(emptyRunReason("ready")).toBe("still");
  });
  it("gives none when the run acted, or the state is unknown", () => {
    expect(emptyRunReason("acted")).toBeNull();
    expect(emptyRunReason("saved")).toBeNull();
    expect(emptyRunReason(undefined)).toBeNull();
  });
});
