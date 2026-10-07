"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("wallet:geoSummary");

export type GeoSummary = {
  byCountry: Array<{ country: string; count: number }>;
  byCity: Array<{ country: string; city: string; count: number }>;
};

export function useGeoSummary(address: string | null): GeoSummary | null {
  const [summary, setSummary] = useState<GeoSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!address) {
        if (!cancelled) setSummary(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/users/${address.toLowerCase()}/geo-summary`,
        );
        const data = (await res.json()) as GeoSummary;
        if (!cancelled) setSummary(data);
      } catch (e) {
        log.error("fetch geo summary failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return summary;
}
