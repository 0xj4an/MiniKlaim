"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("wallet:userHexes");

export type UserHex = {
  h3Id: string;
  claimedAt: string;
  country: string | null;
  city: string | null;
  runHexes: number | null;
};

export function useUserHexes(
  address: string | null,
  limit = 20,
): UserHex[] | null {
  const [hexes, setHexes] = useState<UserHex[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!address) {
        if (!cancelled) setHexes(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/users/${address.toLowerCase()}/hexes?limit=${limit}`,
        );
        const data = (await res.json()) as { hexes: UserHex[] };
        if (!cancelled) setHexes(data.hexes);
      } catch (e) {
        log.error("fetch hexes failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, limit]);

  return hexes;
}
