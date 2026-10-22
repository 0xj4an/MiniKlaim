import { toDataSuffix } from "@celo/attribution-tags";
import { concat, type Hex } from "viem";

/**
 * ERC-8021 attribution tag issued to MiniKlaim by the Celo Attribution Tag
 * Registry (an opaque `celo_xxxxxxxx` code). It is appended to the calldata of
 * every write transaction, both player txs and backend relayer txs, so Celo
 * credits the on-chain activity to MiniKlaim. The EVM ignores trailing
 * calldata, so the suffix changes neither behaviour nor meaningful gas.
 *
 * The tag comes from the env, not the source: the repo is public and Celo asks
 * that the code-to-app mapping stay private. It is NEXT_PUBLIC because player
 * txs are built in the browser. Unset or invalid: transactions go untagged.
 */
export const APP_ATTRIBUTION_CODE = process.env.NEXT_PUBLIC_CELO_ATTRIBUTION_CODE?.trim() || null;

function buildSuffix(code: string | null): Hex | null {
  if (!code) return null;
  try {
    return toDataSuffix(code);
  } catch {
    // The SDK rejects codes outside [a-z0-9_] or longer than 32 bytes.
    console.warn("[attribution] invalid NEXT_PUBLIC_CELO_ATTRIBUTION_CODE; txs go untagged");
    return null;
  }
}

/** Computed once: the suffix is deterministic for a fixed code. */
const ATTRIBUTION_SUFFIX = buildSuffix(APP_ATTRIBUTION_CODE);

/**
 * Append the MiniKlaim ERC-8021 attribution suffix to a piece of calldata.
 * Use before `sendTransaction` for every write path (claimRun, claimBadges,
 * claimRewards, mintTokens, link tx, relayer capture and mint calls).
 *
 * `data` must already include the function selector (e.g. from viem's
 * `encodeFunctionData`). For raw-data txs (the link ownership proof) pass the
 * raw bytes; the suffix goes after them.
 */
export function withAttribution(data: Hex): Hex {
  return ATTRIBUTION_SUFFIX ? concat([data, ATTRIBUTION_SUFFIX]) : data;
}

export { ATTRIBUTION_SUFFIX };
