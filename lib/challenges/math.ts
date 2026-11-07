import { encodePacked, type Hex, keccak256 } from "viem";

/**
 * Weekly challenge arithmetic, pure so the money rules sit in one tested place.
 * All amounts are token base units.
 */

/** Pool = seed + carried pool + `poolBps` of the entries (8000 = 80%). */
export function poolAmount(p: {
  seed: bigint;
  carry: bigint;
  entries: bigint;
  poolBps: number;
}): bigint {
  return p.seed + p.carry + (p.entries * BigInt(p.poolBps)) / 10_000n;
}

/** Protocol share of the entries: what the pool does not take. */
export function revenueAmount(entries: bigint, poolBps: number): bigint {
  return entries - (entries * BigInt(poolBps)) / 10_000n;
}

/** Equal parts; the remainder (at most winners - 1 base units) stays in the contract. */
export function prizePerWinner(pool: bigint, winners: number): bigint {
  if (winners <= 0) return 0n;
  return pool / BigInt(winners);
}

/**
 * Draw `count` distinct winners from `qualified`, reproducible by anyone from
 * public data: the list is sorted, and pick `i` is
 * keccak256(seed, challengeId, i) modulo what is left. `seed` is the hash of
 * the draw block fixed when the challenge was created.
 */
export function drawWinners(qualified: readonly string[], seed: Hex, challengeId: string, count: number): string[] {
  const pool = Array.from(new Set(qualified.map((a) => a.toLowerCase()))).sort();
  const winners: string[] = [];
  for (let i = 0; pool.length > 0 && winners.length < count; i++) {
    const h = BigInt(keccak256(encodePacked(["bytes32", "string", "uint256"], [seed, challengeId, BigInt(i)])));
    const idx = Number(h % BigInt(pool.length));
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

/** Block expected `seconds` from now on Celo (about one block per second), plus a margin. */
export function blockAfter(currentBlock: bigint, seconds: number, marginBlocks = 600): bigint {
  return currentBlock + BigInt(Math.max(0, Math.ceil(seconds))) + BigInt(marginBlocks);
}
