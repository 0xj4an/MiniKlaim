"use client";

import { useCallback, useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";

const log = createLogger("wallet:user");

export type User = {
  address: string;
  username: string | null;
  createdAt: string;
};

export type SetUsernameResult = { ok: boolean; error?: string };

export type UseUser = {
  user: User | null;
  isLoading: boolean;
  setUsername: (username: string) => Promise<SetUsernameResult>;
};

export function useUser(address: string | null): UseUser {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const chainKey = useActiveChainKey();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!address) {
        if (!cancelled) setUser(null);
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/users/${address.toLowerCase()}?chain=${chainKey}`,
        );
        const data = (await res.json()) as { user: User | null };
        if (!cancelled) setUser(data.user);
      } catch (e) {
        log.error("fetch user failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, chainKey]);

  const setUsername = useCallback<UseUser["setUsername"]>(
    async (username) => {
      if (!address) return { ok: false, error: "not connected" };
      try {
        const res = await fetch(
          `/api/users/${address.toLowerCase()}/username?chain=${chainKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
          },
        );
        const data = (await res.json()) as { user: User } | { error: string };
        if (!res.ok || "error" in data) {
          const error = "error" in data ? data.error : `status ${res.status}`;
          log.warn("set username failed", { error });
          return { ok: false, error };
        }
        setUser(data.user);
        log.info("username updated", { username: data.user.username });
        return { ok: true };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        log.error("set username error", { error });
        return { ok: false, error };
      }
    },
    [address, chainKey],
  );

  return { user, isLoading, setUsername };
}
