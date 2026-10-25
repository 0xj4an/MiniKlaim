"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";
import type { LeaderboardEntry } from "@/lib/useLeaderboard";
import { TOP_COLOR_COUNT, topColorMap } from "@/lib/map/topColors";

const log = createLogger("topColors");

/**
 * Lowercased wallet -> color for the current top 10 (see lib/map/topColors).
 * Fetched once per page; an empty map until it arrives or if it fails, so the
 * map simply shows gray.
 */
export function useTopColors(): ReadonlyMap<string, string> {
  const [colors, setColors] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/leaderboard?limit=${TOP_COLOR_COUNT}`);
        if (!res.ok) return;
        const json = (await res.json()) as { leaderboard?: LeaderboardEntry[] };
        if (!cancelled) setColors(topColorMap(json.leaderboard));
      } catch (e) {
        log.warn("top colors fetch failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return colors;
}
