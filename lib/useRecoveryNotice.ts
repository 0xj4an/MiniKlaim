"use client";

import { useEffect, useState } from "react";

/**
 * One-time notice for the players caught by the 29 Oct 2026 outage.
 *
 * Their blocks, runs and badges were rebuilt from the chain, but usernames
 * were never stored anywhere recoverable, so a returning player finds their
 * name gone. Without a word of explanation that reads like an account that
 * was broken into, which is worse than the outage itself.
 *
 * The key carries the date, so a future incident gets its own notice instead
 * of being silenced by this one.
 */
const KEY = "miniklaim.seenRecovery.2026-10-29";

/** When the rebuilt database started taking writes. */
export const OUTAGE_AT = Date.parse("2026-10-29T02:00:00Z");

/**
 * Whether this player lost a name to the outage: they existed before it and
 * have no username now. A player who joined afterwards has no name yet
 * either, and telling them about an outage they never saw would only
 * confuse them.
 */
export function affectedByOutage(
  user: { username: string | null; createdAt: string } | null,
): boolean {
  if (!user || user.username) return false;
  const created = Date.parse(user.createdAt);
  return Number.isFinite(created) && created < OUTAGE_AT;
}

export function useRecoveryNotice(
  user: { username: string | null; createdAt: string } | null,
): { showRecovery: boolean; dismiss: () => void } {
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      // Storage disabled: show the notice. Repeating it is better than a
      // player never learning why their name is gone.
    }
    queueMicrotask(() => setSeen(!!stored));
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      // Storage disabled; it reappears next visit, which is acceptable.
    }
    setSeen(true);
  };

  return { showRecovery: !seen && affectedByOutage(user), dismiss };
}
