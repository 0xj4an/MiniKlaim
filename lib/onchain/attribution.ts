import { toDataSuffix } from "@celo/attribution-tags";
import { concat, type Hex } from "viem";

/**
 * ERC-8021 attribution code for MiniKlaim. Appended to the calldata of every
 * Celo write transaction (both client-side player txs and backend relayer
 * txs). Impact tracking to the Celo ecosystem is derived from this suffix;
 * un-tagged transactions are invisible to future reward-program distributions.
 * Source: celopedia attribution-tags reference, ERC-8021 spec.
 */
export const APP_ATTRIBUTION_CODE = "miniklaim";

/**
 * Cached suffix so `toDataSuffix` runs once, not on every tx. The suffix is
 * deterministic for a fixed code, so we can memoize at module scope.
 */
const ATTRIBUTION_SUFFIX = toDataSuffix(APP_ATTRIBUTION_CODE);

/**
 * Append the MiniKlaim ERC-8021 attribution suffix to a piece of calldata.
 * Use before `sendTransaction` for any Celo write path (claimRun, claimBadges,
 * claimRewards, link tx, and relayer capture / mint calls).
 *
 * `data` must include the function selector already (e.g. produced by
 * viem's `encodeFunctionData`). For raw-data txs (e.g. the link ownership
 * proof) just pass the raw bytes; the suffix is appended after them.
 */
export function withAttribution(data: Hex): Hex {
  return concat([data, ATTRIBUTION_SUFFIX]);
}

export { ATTRIBUTION_SUFFIX };
