import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }));

import { clearRankingCache, getRanking } from "./leaderboardRanking";

function row(rank: number, addr: string, hexCount: number) {
  return { groupKey: addr, rank, address: addr, username: null, hexCount };
}

/** One build runs two queries: the ranked list and the wallet-to-group map. */
const QUERIES_PER_BUILD = 2;
const builds = () => execute.mock.calls.length / QUERIES_PER_BUILD;

describe("the shared leaderboard ranking", () => {
  beforeEach(() => {
    clearRankingCache();
    execute.mockReset();
    // A build issues the ranked list first, then the wallet-to-group map.
    execute.mockImplementation(() =>
      Promise.resolve(
        execute.mock.calls.length % 2 === 1
          ? [row(1, "0xa", 9), row(2, "0xb", 4)]
          : [
              { address: "0xa", groupKey: "0xa" },
              { address: "0xb", groupKey: "0xb" },
              { address: "0xb2", groupKey: "0xb" },
            ],
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds the ranking once and serves the rest from memory", async () => {
    await getRanking();
    await getRanking();
    expect(builds()).toBe(1);
  });

  it("gives two callers arriving together one build, not two", async () => {
    // The point of caching this at all: a cold cache under traffic used to run
    // the 355 ms query once per request.
    const [a, b] = await Promise.all([getRanking(), getRanking()]);
    expect(builds()).toBe(1);
    expect(a).toBe(b);
  });

  it("indexes every group, so a pinned row needs no second query", async () => {
    const { byGroup } = await getRanking();
    expect(byGroup.get("0xb")?.rank).toBe(2);
    expect(byGroup.get("0xnobody")).toBeUndefined();
  });

  it("maps a linked wallet to the group it ranks under", async () => {
    // A second wallet of the same player must resolve to that player's row,
    // not to a row of its own.
    const { groupOf, byGroup } = await getRanking();
    expect(groupOf.get("0xb2")).toBe("0xb");
    expect(byGroup.get(groupOf.get("0xb2")!)?.rank).toBe(2);
  });

  it("serves the expired ranking right away and refreshes behind it", async () => {
    vi.useFakeTimers();
    const first = await getRanking();
    vi.advanceTimersByTime(31_000);
    const second = await getRanking();
    // Same object: nobody waited for the rebuild.
    expect(second).toBe(first);
    await vi.waitFor(() => expect(builds()).toBe(2));
  });

  it("does not pin every later caller to a failed build", async () => {
    execute.mockRejectedValueOnce(new Error("db down"));
    await expect(getRanking()).rejects.toThrow("db down");
    const { rows } = await getRanking();
    expect(rows.map((r) => r.address)).toEqual(["0xa", "0xb"]);
  });
});
