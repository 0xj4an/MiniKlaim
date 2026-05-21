"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("activity");

export type ActivityEntry = {
  id: string;
  address: string;
  username: string | null;
  startedAt: string;
  endedAt: string;
  hexesClaimed: number;
  distanceMeters: number;
};

export function useActivity(limit = 10): ActivityEntry[] | null {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/activity?limit=${limit}`);
        const data = (await res.json()) as { activity: ActivityEntry[] };
        if (!cancelled) setEntries(data.activity);
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
