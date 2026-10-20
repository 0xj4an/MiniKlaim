/**
 * Mobile data drops a request now and then. Safari says "Load failed",
 * Chrome "Failed to fetch", old WebViews "network error". The sponsor and
 * voucher calls after a run died on one such drop and the run stayed
 * unminted (MINIKLAIM-12, -G, -X, -7). These endpoints are safe to call
 * twice: the sponsor route refuses a second call while one is in flight and
 * mints only what is still pending.
 */
const NETWORK =
  /failed to fetch|load failed|network ?error|networkerror|network connection was lost|network request failed|the internet connection appears to be offline/i;

export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;
  return error instanceof TypeError
    ? NETWORK.test(error.message) || error.message === ""
    : NETWORK.test(error.message);
}

const RETRY_STATUS = new Set([502, 503, 504]);

export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  opts: {
    retries?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const delayMs = opts.delayMs ?? 2500;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(input, init);
      if (!RETRY_STATUS.has(res.status) || attempt >= retries) return res;
    } catch (e) {
      if (!isNetworkError(e) || attempt >= retries) throw e;
    }
    await sleep(delayMs * (attempt + 1));
  }
}

/** The sponsor route answers 409 "already in progress" to a repeated call. */
export async function isSponsorInProgress(res: Response): Promise<boolean> {
  if (res.status !== 409) return false;
  const body = (await res
    .clone()
    .json()
    .catch(() => ({}))) as { error?: unknown };
  return body.error === "already in progress";
}
