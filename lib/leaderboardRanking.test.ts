import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }));

import { clearRankingCache, getRanking } from "./leaderboardRanking";

function row(rank: number, addr: string, hexCount: number) {
  return { groupKey: addr, rank, address: addr, username: null, hexCount };
}

describe("the shared leaderboard ranking", () => {
  beforeEach(() => {
    clearRankingCache();
    execute.mockReset();
    execute.mockResolvedValue([row(1, "0xa", 9), row(2, "0xb", 4)]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds the ranking once and serves the rest from memory", async () => {
    await getRanking();
    await getRanking();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("gives two callers arriving together one query, not two", async () => {
    // The point of caching this at all: a cold cache under traffic used to run
    // the 355 ms query once per request.
    const [a, b] = await Promise.all([getRanking(), getRanking()]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("indexes every group, so a pinned row needs no second query", async () => {
    const { byGroup } = await getRanking();
    expect(byGroup.get("0xb")?.rank).toBe(2);
    expect(byGroup.get("0xnobody")).toBeUndefined();
  });

  it("rebuilds once the ranking is older than its TTL", async () => {
    vi.useFakeTimers();
    await getRanking();
    vi.advanceTimersByTime(31_000);
    await getRanking();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("does not pin every later caller to a failed build", async () => {
    execute.mockRejectedValueOnce(new Error("db down"));
    await expect(getRanking()).rejects.toThrow("db down");
    const { rows } = await getRanking();
    expect(rows.map((r) => r.address)).toEqual(["0xa", "0xb"]);
  });
});
