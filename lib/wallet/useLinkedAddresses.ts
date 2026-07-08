"use client";

import { useEffect, useMemo, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("wallet:linkedAddresses");

/**
 * Returns the set of wallet addresses linked to the connected wallet's
 * player (including the connected address itself). Used to color hexes as
 * "mine" and filter the "my territory" view across every linked wallet.
 *
 * Defaults to `{connected}` (a single-item set) while loading, so pre-link
 * behavior is unchanged for the vast majority of users. Empty set only
 * when `enabled=false` or no address.
 */
export function useLinkedAddresses(
  address: string | null,
  enabled: boolean,
): Set<string> {
  const [addresses, setAddresses] = useState<string[] | null>(null);

  useEffect(() => {
    if (!enabled || !address) {
      setAddresses(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/users/${address.toLowerCase()}/linked`,
        );
        if (!res.ok) {
          log.warn("linked fetch bad status", { status: res.status });
          return;
        }
        const data = (await res.json()) as { addresses: string[] };
        if (!cancelled) {
          setAddresses(data.addresses.map((a) => a.toLowerCase()));
        }
      } catch (e) {
        log.warn("linked fetch failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, enabled]);

  return useMemo(() => {
    if (!enabled || !address) return new Set<string>();
    const lower = address.toLowerCase();
    if (addresses === null) return new Set([lower]);
    const set = new Set(addresses);
    set.add(lower);
    return set;
  }, [address, enabled, addresses]);
}
