"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("globalStats");

export type GlobalStats = {
  totalHexes: number;
  totalRuns: number;
  totalPlayers: number;
};

export function useGlobalStats(): GlobalStats | null {
  const [stats, setStats] = useState<GlobalStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stats");
        const data = (await res.json()) as GlobalStats;
        if (!cancelled) setStats(data);
      } catch (e) {
        log.error("fetch failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
