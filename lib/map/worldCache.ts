import type { ClaimedHexRow } from "@/lib/map/claimedView";
import { rowsFromWorldResponse, WORLD_GROUPED_PARAM } from "@/lib/map/worldHexes";

const DB_NAME = "miniklaim";
const STORE = "kv";
const KEY = "world-owners";

/**
 * The world view draws one dot per parent cell, so it asks the server for
 * the list already thinned to that resolution: about two thousand rows
 * instead of 303,000. The full list is a separate cache entry, fetched only
 * when the player zooms far enough in for real polygons.
 */
const THIN_KEY = (res: number) => `world-thin-${res}`;

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

/** Blocks captured in total, which the thinned list carries separately. */
export function parseWorldTotal(body: string | undefined): number | null {
  if (!body) return null;
  try {
    const n = (JSON.parse(body) as { total?: unknown }).total;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
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

export async function readCachedWorld(
  res: number | null = null,
): Promise<CachedWorld | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const value = await new Promise<CachedWorld | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(res === null ? KEY : THIN_KEY(res));
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

export async function writeCachedWorld(
  entry: CachedWorld,
  res: number | null = null,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry, res === null ? KEY : THIN_KEY(res));
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
  /** Parent resolution to ask the server for, or null for every block. */
  thinRes: number | null = null,
): Promise<{ rows: ClaimedHexRow[]; changed: boolean; total: number | null } | null> {
  const previous = parseWorldBody(cached?.body);
  const url =
    thinRes === null
      ? `/api/hexes?${WORLD_GROUPED_PARAM}`
      : `/api/hexes?res=${thinRes}`;
  try {
    const res = await fetch(url, {
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
    const prevTotal = parseWorldTotal(cached?.body);
    if (!next)
      return previous ? { rows: previous, changed: false, total: prevTotal } : null;
    if (res.status === 200) await writeCachedWorld(next, thinRes);
    if (res.status === 304 && previous)
      return { rows: previous, changed: false, total: prevTotal };
    const rows = parseWorldBody(next.body);
    if (!rows)
      return previous ? { rows: previous, changed: false, total: prevTotal } : null;
    return {
      rows,
      changed: res.status === 200,
      total: parseWorldTotal(next.body),
    };
  } catch {
    return previous
      ? { rows: previous, changed: false, total: parseWorldTotal(cached?.body) }
      : null;
  }
}
