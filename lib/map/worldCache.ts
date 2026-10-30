import type { ClaimedHexRow } from "@/lib/map/claimedView";
import { rowsFromWorldResponse, WORLD_GROUPED_PARAM } from "@/lib/map/worldHexes";

const DB_NAME = "miniklaim";
const STORE = "kv";
const KEY = "world-owners";

export type CachedWorld = { etag: string; body: string; savedAt: number };

export function cacheRequestHeaders(etag: string | null): HeadersInit {
  return etag ? { "If-None-Match": etag } : {};
}

/** What to keep after a world-hex response. A failure keeps the previous copy. */
export function storedWorld(
  cached: CachedWorld | null,
  status: number,
  etag: string | null,
  body: string,
  now: number,
): CachedWorld | null {
  if (status === 304 && cached) return { ...cached, savedAt: now };
  if (status === 200 && body) return { etag: etag ?? "", body, savedAt: now };
  return cached;
}

export function parseWorldBody(body: string | undefined): ClaimedHexRow[] | null {
  if (!body) return null;
  try {
    const rows = rowsFromWorldResponse(JSON.parse(body) as {
      hexes?: ClaimedHexRow[];
      owners?: { owner: string; ownerUsername: string | null; h3: string[] }[];
    });
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function readCachedWorld(): Promise<CachedWorld | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const value = await new Promise<CachedWorld | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as CachedWorld | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!value || typeof value.body !== "string") return null;
    return value;
  } catch {
    return null;
  }
}

export async function writeCachedWorld(entry: CachedWorld): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // A full disk or a private mode that blocks IndexedDB still has the network.
  }
}

/**
 * Revalidate the world list. `changed` is false when the phone already has
 * this copy, so the map does not rebuild a quarter-million polygons for nothing.
 */
export async function fetchWorldRows(
  cached: CachedWorld | null,
): Promise<{ rows: ClaimedHexRow[]; changed: boolean } | null> {
  const previous = parseWorldBody(cached?.body);
  try {
    const res = await fetch(`/api/hexes?${WORLD_GROUPED_PARAM}`, {
      headers: cacheRequestHeaders(cached?.etag ?? null),
    });
    const body = res.status === 200 ? await res.text() : "";
    const next = storedWorld(
      cached,
      res.status,
      res.headers.get("etag"),
      body,
      Date.now(),
    );
    if (!next) return previous ? { rows: previous, changed: false } : null;
    if (res.status === 200) await writeCachedWorld(next);
    if (res.status === 304 && previous) return { rows: previous, changed: false };
    const rows = parseWorldBody(next.body);
    if (!rows) return previous ? { rows: previous, changed: false } : null;
    return { rows, changed: res.status === 200 };
  } catch {
    return previous ? { rows: previous, changed: false } : null;
  }
}
