/**
 * One shared, short-lived copy of an expensive read, with the in-flight
 * request deduplicated.
 *
 * The world-hex route has had this shape since the list grew past a few MB;
 * this is the same thing extracted so other heavy reads can use it. It is
 * per-process, so with more than one container each keeps its own copy —
 * fine for a value that may lag by its TTL, wrong for anything that must be
 * consistent between replicas.
 *
 * Two callers arriving together share one load: without that, a cold cache
 * under traffic runs the expensive query once per request instead of once.
 */
export type SharedCache<T> = {
  get: (key: string, load: () => Promise<T>) => Promise<T>;
  /** Drop an entry, or the whole cache when no key is given. Tests use this. */
  clear: (key?: string) => void;
  size: () => number;
};

export function createSharedCache<T>(ttlMs: number): SharedCache<T> {
  const cache = new Map<string, { value: T; at: number }>();
  const inflight = new Map<string, Promise<T>>();

  return {
    async get(key, load) {
      const now = Date.now();
      const hit = cache.get(key);
      if (hit && now - hit.at < ttlMs) return hit.value;

      const running = inflight.get(key);
      if (running) return running;

      const started = load()
        .then((value) => {
          cache.set(key, { value, at: Date.now() });
          return value;
        })
        .finally(() => {
          // Always cleared, including on a rejection, so a failed load does
          // not pin every later caller to the same error.
          inflight.delete(key);
        });
      inflight.set(key, started);
      return started;
    },
    clear(key) {
      if (key === undefined) {
        cache.clear();
        inflight.clear();
        return;
      }
      cache.delete(key);
      inflight.delete(key);
    },
    size: () => cache.size,
  };
}
