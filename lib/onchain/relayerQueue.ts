/**
 * Serialises every transaction the backend relayer sends.
 *
 * All relayer paths (`captureBatch` on Hexes, `mintBatch` on Badges, and the
 * retry cron) sign with the same key, and each builds its own viem wallet
 * client with no shared nonce state. Two routes firing close together both
 * read the same pending nonce, one lands, and Celo's RPC rejects the other
 * with "Missing or invalid parameters", which reads like a malformed request
 * rather than the nonce collision it actually is.
 *
 * That is how a finished run could mint its hexes and silently lose its
 * badges: `/api/runs/[id]/sponsor-mint` and
 * `/api/users/[address]/badges/sponsor-mint` raced each other.
 *
 * A promise chain only guards one Node process. The retry cron is a second
 * process on the same key, so a collision can still happen while it runs
 * (seen 12 Oct 04:14 UTC, during the 04:00 cron pass). A nonce error is
 * retried: viem reads the pending nonce again on each send.
 */

const NONCE_RETRIES = 3;
const NONCE_RETRY_MS = 1500;

/** The RPC refused the nonce because another sender used it first. */
export function isNonceError(e: unknown): boolean {
  const text = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    text.includes("nonce too low") ||
    text.includes("lower than the current nonce") ||
    text.includes("nonce provided for the transaction")
  );
}

async function withNonceRetry<T>(send: () => Promise<T> | T): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (e) {
      if (attempt >= NONCE_RETRIES - 1 || !isNonceError(e)) throw e;
      await new Promise((r) => setTimeout(r, NONCE_RETRY_MS * (attempt + 1)));
    }
  }
}

let tail: Promise<unknown> = Promise.resolve();

/**
 * Run `send` once every previously queued send has settled. A rejection is
 * contained: it surfaces to its own caller and the queue continues.
 */
export function sendExclusive<T>(send: () => Promise<T> | T): Promise<T> {
  const result = tail.then(
    () => withNonceRetry(send),
    () => withNonceRetry(send),
  );
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
