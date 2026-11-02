import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }));

const getRanking = vi.fn();
vi.mock("@/lib/leaderboardRanking", () => ({ getRanking: () => getRanking() }));

import { clearLeaderboardPageCache, getLeaderboardTop } from "./leaderboardPage";

function ranked(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    groupKey: `0x${i}`,
    rank: i + 1,
    address: `0x${i}`,
    username: null,
    hexCount: 1000 - i,
  }));
}

describe("the shared leaderboard page", () => {
  beforeEach(() => {
    clearLeaderboardPageCache();
    execute.mockReset();
    execute.mockResolvedValue([]);
    getRanking.mockReset();
    getRanking.mockResolvedValue({
      rows: ranked(120),
      byGroup: new Map(),
      groupOf: new Map(),
      builtAt: Date.now(),
    });
  });

  it("builds at most one page, whatever a caller wants to show", async () => {
    await getLeaderboardTop();
    await getLeaderboardTop();
    // Four lookups for the one build, none for the second caller.
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("builds the top 100, so a shorter page is a slice and not a query", async () => {
    const top = await getLeaderboardTop();
    expect(top).toHaveLength(100);
    expect(top.slice(0, 10).map((r) => r.address)).toEqual(
      ranked(10).map((r) => r.address),
    );
  });

  it("keeps the ranking's order and counts", async () => {
    const top = await getLeaderboardTop();
    expect(top[0]).toMatchObject({ address: "0x0", hexCount: 1000 });
    expect(top[99].hexCount).toBe(901);
  });

  it("gives an empty ranking an empty page without touching the database", async () => {
    getRanking.mockResolvedValue({
      rows: [],
      byGroup: new Map(),
      groupOf: new Map(),
      builtAt: Date.now(),
    });
    expect(await getLeaderboardTop()).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
});
