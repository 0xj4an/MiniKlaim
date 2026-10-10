import { latLngToCell } from "h3-js";
import { interpolateHexIds } from "@/lib/map/hex";

// A fix older than this is a signal gap, not a path. Claim the hex the
// player is standing on. Do not draw the straight line between the two fixes.
export const GPS_GAP_STALE_SECONDS = 10;

// Middleware allows 30 writes a minute on /claim, then blocks the rest of
// the window. One upload every 2.5s stays at 24 per minute.
export const CLAIM_FLUSH_MS = 2500;

// One POST can carry many hexes. Cap the body so a long offline stretch
// does not turn into a single huge request.
export const CLAIM_BATCH_MAX = 100;

const RETRY_MAX_MS = 15_000;
const RATE_MAX_MS = 60_000;

export type QueuedHex = {
  h3: string;
  distanceMeters: number;
  accuracy?: number;
};

export type ClaimResultRow = {
  h3: string;
  alreadyOwned?: boolean;
  rejected?: { reason: string; detail?: string };
};

export type ClaimOutcome =
  | { kind: "ok"; results: ClaimResultRow[] }
  | { kind: "rate"; retryAfterMs: number }
  | { kind: "ended" }
  | { kind: "retry" };

/** Drop hexes this player already owns. The caller keeps their distance. */
export function withoutOwned(ids: string[], owned: ReadonlySet<string>): string[] {
  if (owned.size === 0) return ids;
  const out: string[] = [];
  for (const id of ids) {
    if (!id || owned.has(id)) continue;
    out.push(id);
  }
  return out;
}

export function addHexes(items: QueuedHex[], incoming: QueuedHex[]): QueuedHex[] {
  if (incoming.length === 0) return items;
  const seen = new Set(items.map((item) => item.h3));
  const next = items.slice();
  for (const item of incoming) {
    if (!item.h3 || seen.has(item.h3)) continue;
    seen.add(item.h3);
    next.push(item);
  }
  return next;
}

export function flushDelay(
  lastFlushAt: number,
  now: number,
  flushMs = CLAIM_FLUSH_MS,
): number {
  const elapsed = now - lastFlushAt;
  return elapsed >= flushMs ? 0 : flushMs - elapsed;
}

export function takeBatch(
  items: QueuedHex[],
  max = CLAIM_BATCH_MAX,
): { batch: QueuedHex[]; rest: QueuedHex[] } {
  if (items.length <= max) return { batch: items, rest: [] };
  return { batch: items.slice(0, max), rest: items.slice(max) };
}

export function applyHttp(
  items: QueuedHex[],
  sentIds: string[],
  outcome: ClaimOutcome,
  failures: number,
): { items: QueuedHex[]; newly: number; retryMs: number | null; failures: number } {
  if (outcome.kind === "ended") {
    return { items: [], newly: 0, retryMs: null, failures: 0 };
  }
  if (outcome.kind === "rate") {
    const wait = Number.isFinite(outcome.retryAfterMs) ? outcome.retryAfterMs : 2000;
    const retryMs = Math.min(RATE_MAX_MS, Math.max(1000, wait));
    return { items, newly: 0, retryMs, failures: failures + 1 };
  }
  if (outcome.kind === "retry") {
    const retryMs = Math.min(RETRY_MAX_MS, CLAIM_FLUSH_MS * Math.max(1, failures + 1));
    return { items, newly: 0, retryMs, failures: failures + 1 };
  }
  const answered = new Set(outcome.results.map((row) => row.h3));
  const sent = new Set(sentIds);
  const next = items.filter((item) => !sent.has(item.h3) || !answered.has(item.h3));
  const newly = outcome.results.filter(
    (row) => sent.has(row.h3) && !row.rejected && row.alreadyOwned !== true,
  ).length;
  return {
    items: next,
    newly,
    retryMs: next.length > 0 ? CLAIM_FLUSH_MS : null,
    failures: 0,
  };
}

export function parseQueue(raw: string | null): QueuedHex[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: QueuedHex[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const h3 = (row as { h3?: unknown }).h3;
      if (typeof h3 !== "string" || h3.length === 0) continue;
      const distance = (row as { distanceMeters?: unknown }).distanceMeters;
      const accuracy = (row as { accuracy?: unknown }).accuracy;
      out.push({
        h3,
        distanceMeters: typeof distance === "number" && distance > 0 ? distance : 0,
        ...(typeof accuracy === "number" && Number.isFinite(accuracy)
          ? { accuracy }
          : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function queueStorageKey(runId: string): string {
  return `miniklaim.claimQueue.${runId}`;
}

/**
 * Hexes to store for one GPS fix.
 * A fresh pair of fixes keeps the cells between them, because those pings
 * are a few seconds apart and the player did cross them.
 * A stale gap stores only the cell under the new fix. The missing time is
 * not filled with a straight line.
 */
export function hexesForSegment(
  from: { lat: number; lng: number } | null,
  to: { lat: number; lng: number },
  gapSeconds: number,
  resolution: number,
): string[] {
  const end = latLngToCell(to.lat, to.lng, resolution);
  if (!from || gapSeconds > GPS_GAP_STALE_SECONDS) return [end];
  const crossed = interpolateHexIds(from.lat, from.lng, to.lat, to.lng, resolution);
  return crossed.length > 0 ? crossed : [end];
}
