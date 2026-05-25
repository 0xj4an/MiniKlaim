"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("wallet:userBadges");

export type UserBadges = {
  contract: string | null;
  heldIds: number[];
};

export function useUserBadges(address: string | null): UserBadges | null {
  const [data, setData] = useState<UserBadges | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!address) {
        if (!cancelled) setData(null);
        return;
      }
      try {
        const res = await fetch(`/api/users/${address.toLowerCase()}/badges`);
        const json = (await res.json()) as UserBadges;
        if (!cancelled) setData(json);
      } catch (e) {
        log.error("fetch badges failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return data;
}
