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
 * A promise chain is enough. This only guards one Node process, which is what
 * the single-replica deployment is; if the web service is ever scaled out, the
 * nonce has to move to a shared source instead.
 */

let tail: Promise<unknown> = Promise.resolve();

/**
 * Run `send` once every previously queued send has settled. A rejection is
 * contained: it surfaces to its own caller and the queue continues.
 */
export function sendExclusive<T>(send: () => Promise<T> | T): Promise<T> {
  const result = tail.then(
    () => send(),
    () => send(),
  );
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
