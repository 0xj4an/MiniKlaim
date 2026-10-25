"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("leaderboard");

export type LeaderboardEntry = {
  address: string;
  username: string | null;
  hexCount: number;
  runCount: number;
  countries: string[];
  badges: string[];
  /** Other wallets linked to this player (lowercase). */
  linked?: string[];
};

export type MyRank = {
  rank: number;
  address: string;
  username: string | null;
  hexCount: number;
};

export type LeaderboardData = {
  entries: LeaderboardEntry[];
  me: MyRank | null;
};

/**
 * Top players, plus the connected player's own rank when `me` is given.
 * Raising `limit` refetches but keeps the previous list on screen meanwhile.
 */
export function useLeaderboard(
  limit = 10,
  me: string | null = null,
): LeaderboardData | null {
  const [data, setData] = useState<LeaderboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const qs = new URLSearchParams({ limit: String(limit) });
        if (me) qs.set("me", me);
        const res = await fetch(`/api/leaderboard?${qs}`);
        const json = (await res.json()) as {
          leaderboard: LeaderboardEntry[];
          me?: MyRank | null;
        };
        if (!cancelled) {
          setData({ entries: json.leaderboard, me: json.me ?? null });
        }
      } catch (e) {
        log.error("fetch failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit, me]);

  return data;
}
