"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("wallet:activeRun");

export type ActiveRun = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  hexesClaimed: number;
};

export type UseActiveRun = {
  active: ActiveRun | null;
  isLoading: boolean;
};

/**
 * Fetches the user's currently-active run on mount and when address changes.
 * Server-side, stale runs (>2h since start) are auto-finished and excluded.
 */
export function useActiveRun(address: string | null): UseActiveRun {
  const [active, setActive] = useState<ActiveRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!address) {
        if (!cancelled) {
          setActive(null);
          setIsLoading(false);
        }
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/users/${address.toLowerCase()}/runs/active`,
        );
        const data = (await res.json()) as { active: ActiveRun | null };
        if (!cancelled) {
          setActive(data.active);
          log.info("active run loaded", {
            id: data.active?.id ?? null,
            hexesClaimed: data.active?.hexesClaimed ?? 0,
          });
        }
      } catch (e) {
        log.error("fetch active run failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { active, isLoading };
}
