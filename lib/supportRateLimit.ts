/**
 * In-memory sliding window for the support form. One web instance serves the
 * app, so a per-process map is enough to stop a stuck button or a script from
 * flooding the inbox; it resets on deploy, which is fine for this purpose.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;
const hits = new Map<string, number[]>();

export function allowSupportRequest(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return true;
}

export function resetSupportRateLimit(): void {
  hits.clear();
}
