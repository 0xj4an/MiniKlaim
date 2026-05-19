"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("wallet:userRuns");

export type UserRun = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  hexesClaimed: number;
};

export function useUserRuns(
  address: string | null,
  limit = 10,
): UserRun[] | null {
  const [runs, setRuns] = useState<UserRun[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!address) {
        if (!cancelled) setRuns(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/users/${address.toLowerCase()}/runs?limit=${limit}`,
        );
        const data = (await res.json()) as { runs: UserRun[] };
        if (!cancelled) setRuns(data.runs);
      } catch (e) {
        log.error("fetch runs failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, limit]);

  return runs;
}
