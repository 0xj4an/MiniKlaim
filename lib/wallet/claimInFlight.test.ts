import { describe, expect, it, vi } from "vitest";

type Mod = typeof import("./claimInFlight");

/**
 * The registry is module-scoped mutable state on purpose (it is shared across
 * unrelated component trees). Re-importing a fresh copy per test keeps the
 * cases isolated without exposing a reset hook in the public API.
 */
async function freshModule(): Promise<Mod> {
  vi.resetModules();
  return import("./claimInFlight");
}

describe("run claim registry", () => {
  it("reports a run as not claiming until it is marked", async () => {
    const m = await freshModule();
    expect(m.isRunClaiming("run-1")).toBe(false);
  });

  it("reports a marked run as claiming", async () => {
    const m = await freshModule();
    m.markRunClaiming("run-1");
    expect(m.isRunClaiming("run-1")).toBe(true);
  });

  it("stops reporting a run once it is cleared", async () => {
    const m = await freshModule();
    m.markRunClaiming("run-1");
    m.clearRunClaiming("run-1");
    expect(m.isRunClaiming("run-1")).toBe(false);
  });

  it("tracks runs independently", async () => {
    const m = await freshModule();
    m.markRunClaiming("run-1");
    expect(m.isRunClaiming("run-2")).toBe(false);
    m.clearRunClaiming("run-1");
    m.markRunClaiming("run-2");
    expect(m.isRunClaiming("run-1")).toBe(false);
    expect(m.isRunClaiming("run-2")).toBe(true);
  });

  it("tolerates clearing a run that was never marked", async () => {
    const m = await freshModule();
    expect(() => m.clearRunClaiming("ghost")).not.toThrow();
    expect(m.isRunClaiming("ghost")).toBe(false);
  });
});

describe("badge claim registry", () => {
  it("reports a badge as not pending until it is marked", async () => {
    const m = await freshModule();
    expect(m.isBadgeClaimPending(1)).toBe(false);
  });

  it("reports every badge in a submitted set as pending", async () => {
    const m = await freshModule();
    m.markBadgeClaimSubmitted([1, 2, 3]);
    expect(m.isBadgeClaimPending(1)).toBe(true);
    expect(m.isBadgeClaimPending(2)).toBe(true);
    expect(m.isBadgeClaimPending(3)).toBe(true);
    expect(m.isBadgeClaimPending(4)).toBe(false);
  });

  it("drops only the badges it is told to drop", async () => {
    const m = await freshModule();
    m.markBadgeClaimSubmitted([1, 2, 3]);
    m.dropBadgeClaims([2]);
    expect(m.isBadgeClaimPending(1)).toBe(true);
    expect(m.isBadgeClaimPending(2)).toBe(false);
    expect(m.isBadgeClaimPending(3)).toBe(true);
  });

  it("tolerates an empty mark and an empty drop", async () => {
    const m = await freshModule();
    expect(() => m.markBadgeClaimSubmitted([])).not.toThrow();
    expect(() => m.dropBadgeClaims([])).not.toThrow();
    expect(m.isBadgeClaimPending(1)).toBe(false);
  });

  it("expires a pending badge once the suppression window passes", async () => {
    vi.useFakeTimers();
    try {
      const m = await freshModule();
      m.markBadgeClaimSubmitted([7]);
      vi.advanceTimersByTime(m.BADGE_CLAIM_SUPPRESS_MS - 1);
      expect(m.isBadgeClaimPending(7)).toBe(true);
      vi.advanceTimersByTime(2);
      expect(m.isBadgeClaimPending(7)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-marking a badge restarts its suppression window", async () => {
    vi.useFakeTimers();
    try {
      const m = await freshModule();
      m.markBadgeClaimSubmitted([7]);
      vi.advanceTimersByTime(m.BADGE_CLAIM_SUPPRESS_MS - 1);
      m.markBadgeClaimSubmitted([7]);
      vi.advanceTimersByTime(2);
      expect(m.isBadgeClaimPending(7)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
