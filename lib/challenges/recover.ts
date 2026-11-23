/**
 * A paid entry must end up recorded.
 *
 * On 23 Nov 2026 a player's `enterFor` was mined, the contract took 1 USDT,
 * and the row was never written: `waitForTransactionReceipt` threw
 * `BlockNotFoundError` because the public RPC node answering was a block
 * behind the one that had the receipt. The retry three seconds later saw
 * "already entered" on the contract and stopped there, so the app kept
 * telling the player they were not in.
 *
 * Two pieces, both small:
 * - `withLaggingNodeRetry`: a node that is behind is a reason to ask again,
 *   not to give up on a transaction that is already sent.
 * - `findEntryTx`: when the contract says "entered" and we hold no row, the
 *   transaction is on the chain; find it so it can be recorded.
 */
import type { Hex } from "viem";

/** viem's names for "this node does not have it yet". */
const LAGGING = new Set([
  "BlockNotFoundError",
  "TransactionNotFoundError",
  "TransactionReceiptNotFoundError",
]);

export function isLaggingNode(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 6; depth++) {
    const name = (cur as { name?: unknown }).name;
    if (typeof name === "string" && LAGGING.has(name)) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export async function withLaggingNodeRetry<T>(
  read: () => Promise<T>,
  opts: {
    attempts?: number;
    pauseMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const pauseMs = opts.pauseMs ?? 1_500;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 1; ; i++) {
    try {
      return await read();
    } catch (e) {
      if (i >= attempts || !isLaggingNode(e)) throw e;
      await sleep(pauseMs);
    }
  }
}

/** The public RPC answers `eth_getLogs` for at most this many blocks. */
export const LOG_CHUNK = 5_000n;
/** How far back to look: 30 chunks, a bit under two days of Celo blocks. */
export const RECOVER_CHUNKS = 30;

export type EntryLogReader = (range: {
  fromBlock: bigint;
  toBlock: bigint;
}) => Promise<{ transactionHash: Hex }[]>;

/**
 * Newest first, one chunk at a time, stopping at the first hit. `getLogs`
 * is already narrowed to this challenge and this player by the caller.
 */
export async function findEntryTx(
  latest: bigint,
  getLogs: EntryLogReader,
  chunks: number = RECOVER_CHUNKS,
): Promise<Hex | null> {
  let toBlock = latest;
  for (let i = 0; i < chunks && toBlock >= 0n; i++) {
    const fromBlock = toBlock >= LOG_CHUNK - 1n ? toBlock - (LOG_CHUNK - 1n) : 0n;
    const logs = await getLogs({ fromBlock, toBlock });
    if (logs.length > 0) return logs[logs.length - 1].transactionHash;
    if (fromBlock === 0n) break;
    toBlock = fromBlock - 1n;
  }
  return null;
}

