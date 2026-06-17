"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("wallet:userStats");

export type UserStats = {
  hexesOwned: number;
  hexesMinted: number;
  totalRuns: number;
  bestRunHexes: number;
  bestRunDistanceMeters: number;
  rank: number;
  streak: number;
  lifetimeDistanceMeters: number;
  cityCount: number;
  conquests: number;
  countryCount: number;
};

export function useUserStats(address: string | null): UserStats | null {
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!address) {
        if (!cancelled) setStats(null);
        return;
      }
      try {
        const res = await fetch(`/api/users/${address.toLowerCase()}/stats`);
        const data = (await res.json()) as UserStats;
        if (!cancelled) setStats(data);
      } catch (e) {
        log.error("fetch stats failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return stats;
}
