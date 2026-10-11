"use client";

/**
 * Per-run tokens the server hands out when a run starts. Sponsor and decline
 * calls must send the token, so only the client that played the run can ask
 * the relayer to pay for it. Kept in localStorage so a run can still be
 * settled after the app restarts (PendingClaimPrompt).
 */

const KEY = "miniklaim_run_tokens";
const MAX_ENTRIES = 50;
export const RUN_TOKEN_HEADER = "x-run-token";

type Entry = { token: string; address: string; at: number };
type Store = Record<string, Entry>;

const memory: Store = {};

function load(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...(JSON.parse(raw) as Store), ...memory } : { ...memory };
  } catch {
    return { ...memory };
  }
}

function save(store: Store) {
  try {
    const kept = Object.entries(store)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_ENTRIES);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Private mode or storage full: the in-memory copy still covers this session.
  }
}

export function rememberRunToken(
  runId: string,
  address: string,
  token: string,
) {
  const entry = { token, address: address.toLowerCase(), at: Date.now() };
  memory[runId] = entry;
  const store = load();
  store[runId] = entry;
  save(store);
}

export function runToken(runId: string): string | null {
  return load()[runId]?.token ?? null;
}

/** Newest run token held for this wallet, for calls not tied to one run. */
export function latestRunTokenFor(
  address: string,
): { runId: string; token: string } | null {
  const lower = address.toLowerCase();
  let best: { runId: string; token: string; at: number } | null = null;
  for (const [runId, e] of Object.entries(load())) {
    if (e.address === lower && (!best || e.at > best.at)) {
      best = { runId, token: e.token, at: e.at };
    }
  }
  return best ? { runId: best.runId, token: best.token } : null;
}

export function runTokenHeaders(runId: string): Record<string, string> {
  const token = runToken(runId);
  return token ? { [RUN_TOKEN_HEADER]: token } : {};
}

/** Tell the server the player declined, so the retry cron leaves the run alone. */
export async function reportDeclined(runId: string): Promise<void> {
  try {
    await fetch(`/api/runs/${runId}/declined`, {
      method: "POST",
      headers: runTokenHeaders(runId),
    });
  } catch {
    // Best effort. A run with no status is not retried by the cron either.
  }
}
