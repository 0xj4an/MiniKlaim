"use client";

import { createLogger } from "@/lib/logger";
import { runTokensFor } from "@/lib/wallet/runTokens";

const log = createLogger("wallet:ownerKey");

/**
 * This phone's owner key per wallet. Name changes and link codes must send
 * it, because MiniPay cannot sign and the address alone proves nothing. Kept
 * in localStorage: clearing the app's data loses it, and it comes back only
 * while this phone still holds a run token from before owner keys existed.
 * See lib/ownerKeyRules.ts.
 */

const KEY = "miniklaim_owner_keys";
export const OWNER_KEY_HEADER = "x-owner-key";

const memory: Record<string, string> = {};
const inflight = new Map<string, Promise<string | null>>();

function load(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...(JSON.parse(raw) as Record<string, string>), ...memory } : { ...memory };
  } catch {
    return { ...memory };
  }
}

function save(address: string, key: string) {
  memory[address] = key;
  try {
    const store = load();
    store[address] = key;
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Private mode or storage full: the in-memory copy covers this session.
  }
}

/**
 * The key for this wallet, asking the server for one when the phone has
 * none yet. Null when the server will not hand it to this phone.
 */
export function ensureOwnerKey(address: string): Promise<string | null> {
  const lower = address.toLowerCase();
  const held = load()[lower];
  if (held) return Promise.resolve(held);
  const pending = inflight.get(lower);
  if (pending) return pending;
  const request = (async () => {
    try {
      const res = await fetch(`/api/users/${lower}/owner-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runs: runTokensFor(lower).slice(0, 50) }),
      });
      if (!res.ok) {
        log.info("owner key not issued", { status: res.status });
        return null;
      }
      const data = (await res.json()) as { key?: string };
      if (!data.key) return null;
      save(lower, data.key);
      return data.key;
    } catch (e) {
      log.warn("owner key request failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    } finally {
      inflight.delete(lower);
    }
  })();
  inflight.set(lower, request);
  return request;
}

/** Drop a key the server no longer accepts (another phone replaced it). */
export function forgetOwnerKey(address: string) {
  const lower = address.toLowerCase();
  delete memory[lower];
  try {
    const store = load();
    delete store[lower];
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Nothing stored to drop.
  }
}

/** Headers carrying this wallet's key, after fetching it if needed. */
export async function ownerKeyHeaders(
  address: string,
): Promise<Record<string, string>> {
  const key = await ensureOwnerKey(address);
  return key ? { [OWNER_KEY_HEADER]: key } : {};
}
