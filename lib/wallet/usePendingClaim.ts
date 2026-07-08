"use client";

import { useCallback, useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("wallet:pendingClaim");

export type PendingClaimRun = {
  id: string;
  startedAt: string;
  endedAt: string;
  hexesClaimed: number;
  distanceMeters: number;
};

export type UsePendingClaim = {
  pending: PendingClaimRun[];
  refresh: () => void;
};

/**
 * Detects finished runs whose hexes were never minted on-chain. Refetches on
 * mount, on window focus (user returned to the app), and on the `online`
 * event (device regained connectivity). The voucher endpoint is idempotent
 * per run, so a stale refresh cannot cause a double-mint.
 */
export function usePendingClaim(
  address: string | null,
  enabled: boolean,
): UsePendingClaim {
  const [pending, setPending] = useState<PendingClaimRun[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !address) {
      setPending([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/users/${address.toLowerCase()}/runs/pending-claim`,
        );
        if (!res.ok) {
          log.warn("pending claim fetch bad status", { status: res.status });
          return;
        }
        const data = (await res.json()) as { runs: PendingClaimRun[] };
        if (!cancelled) {
          setPending(data.runs);
          log.debug("pending claim runs", { count: data.runs.length });
        }
      } catch (e) {
        log.warn("pending claim fetch failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, enabled, refreshKey]);

  useEffect(() => {
    if (!enabled) return;
    const onFocus = () => refresh();
    const onOnline = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, refresh]);

  return { pending, refresh };
}
