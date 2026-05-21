"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("leaderboard");

export type LeaderboardEntry = {
  address: string;
  username: string | null;
  hexCount: number;
};

export function useLeaderboard(limit = 10): LeaderboardEntry[] | null {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/leaderboard?limit=${limit}`);
        const data = (await res.json()) as { leaderboard: LeaderboardEntry[] };
        if (!cancelled) setEntries(data.leaderboard);
      } catch (e) {
        log.error("fetch failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return entries;
}
