import { estimateMintTokensGas, MINT_TOKENS_MAX } from "@/lib/onchain/sponsorRules";

/**
 * What it takes to turn a pile of blocks into NFTs.
 *
 * A player with a big run has no way of knowing that minting is not one tap.
 * Each `mintTokens` call is capped at MINT_TOKENS_MAX because every ERC-721
 * mint costs about 30,000 gas and a Celo block holds 30,000,000: 700 blocks
 * is already 21.2M, or 71% of a whole block, and 993 would be the entire
 * thing. So a 5,000-block run is eight transactions and eight signatures, and
 * the screen has to say so before the player starts rather than after the
 * third wallet popup.
 *
 * The cost is the player's own, unlike the claim, which the relayer pays.
 */
export type MintPlan = {
  /** Blocks waiting for a token. */
  count: number;
  /** Blocks in each transaction, largest first. The last one is the remainder. */
  batches: number[];
  /** How many times the wallet will ask the player to sign. */
  signatures: number;
  /** Total gas across every batch, for quoting the whole plan. */
  totalGas: bigint;
};

export function mintPlan(count: number, max: number = MINT_TOKENS_MAX): MintPlan {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const cap = Math.max(1, Math.floor(max));
  const batches: number[] = [];
  let left = n;
  while (left > 0) {
    const take = Math.min(left, cap);
    batches.push(take);
    left -= take;
  }
  // Each batch pays the base gas again, which is why ten batches cost more
  // than one batch of ten times the size. Quoting the sum, not count * rate,
  // keeps the figure honest for the players who need it most.
  const totalGas = batches.reduce(
    (sum, b) => sum + estimateMintTokensGas(b),
    0n,
  );
  return { count: n, batches, signatures: batches.length, totalGas };
}

/**
 * Whether this plan is worth warning the player about. One signature is the
 * ordinary case and needs no explanation; more than one does, because the
 * wallet will reappear and a player who was not told assumes it failed.
 */
export function needsBatchWarning(plan: MintPlan): boolean {
  return plan.signatures > 1;
}
