/**
 * Remembering that the server would not hand this phone an owner key.
 *
 * A refusal does not change by asking again: the rule is about what the
 * phone already holds. The first memo lived in the page's memory, so every
 * reload forgot it and asked again. 15 Nov 2026: one wallet was turned away
 * 20 times in 3 minutes. It is now kept in the phone's storage, per wallet.
 */
export const REFUSED_FOR_MS = 30 * 60_000;
const KEY = "miniklaim_owner_key_refused";

type Store = Pick<Storage, "getItem" | "setItem">;

function read(store: Store | null): Record<string, number> {
  if (!store) return {};
  try {
    const raw = store.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [address, at] of Object.entries(parsed)) {
      if (typeof at === "number" && Number.isFinite(at)) out[address] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/** Whether this wallet was refused less than half an hour ago. */
export function refusedRecently(
  store: Store | null,
  address: string,
  now: number,
): boolean {
  const at = read(store)[address.toLowerCase()];
  // A time in the future is a phone whose clock moved back: do not let it
  // silence the question for longer than the window.
  return at !== undefined && at <= now && now - at < REFUSED_FOR_MS;
}

/** Note the refusal, dropping the ones that have already run out. */
export function rememberRefusal(
  store: Store | null,
  address: string,
  now: number,
): void {
  if (!store) return;
  try {
    const kept: Record<string, number> = {};
    for (const [a, at] of Object.entries(read(store))) {
      if (at <= now && now - at < REFUSED_FOR_MS) kept[a] = at;
    }
    kept[address.toLowerCase()] = now;
    store.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Private mode or storage full: the copy in memory covers this page.
  }
}
