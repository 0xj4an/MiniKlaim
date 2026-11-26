import {
  isPermissionDenied,
  isUnpayableFee,
  isWalletInternalError,
} from "@/lib/wallet/playerFee";

/**
 * Why a mint did not go through, and what each answer is worth doing about.
 *
 * The classification already existed, inline in useMintTokens, and it was
 * right. What was missing is that nothing downstream used it: every kind got
 * the same sentence on screen and, worse, the same Sentry fingerprint. The
 * `captureMessage` sent `kind` as a tag but tags do not group, so `tx`,
 * `wallet_internal` and `permission_denied` all piled into one issue titled
 * `Module.T`, a minified function name. MINIKLAIM-1G reads as 9 events from
 * 5 players; it is three unrelated faults counted as one, which is the exact
 * mistake `causeOf` fixed for map failures and that nobody had fixed here.
 *
 * What the data says about each:
 *
 *   no_fee           The player cannot pay the network fee. Not a fault: the
 *                    price is on the button before they tap. Already kept out
 *                    of Sentry (#207).
 *   permission_denied The wallet's RPC refused the send. One event ever, on
 *                    3 Nov, and the player retried four seconds later and it
 *                    went through: same 59 blocks, confirmed 17 s after the
 *                    refusal. So it is transient, not a wallet that blocks
 *                    the app, and "tap it again" is advice that actually
 *                    worked once rather than a guess.
 *   wallet_internal  The wallet threw from inside itself. Rare and opaque.
 *   tx               Everything else. All 69 in the last fortnight predate
 *                    #127, so this bucket is currently empty and should stay
 *                    loud if it refills.
 */
export type MintFailureKind =
  "no_fee" | "permission_denied" | "wallet_internal" | "tx";

export function mintFailureKind(e: unknown): MintFailureKind {
  if (isUnpayableFee(e)) return "no_fee";
  if (isPermissionDenied(e)) return "permission_denied";
  if (isWalletInternalError(e)) return "wallet_internal";
  return "tx";
}

/**
 * Whether this is worth waking someone for.
 *
 * `no_fee` is the player's balance and is handled on screen. Everything else
 * still reports, including `permission_denied`: one event is not a reason to
 * go blind to the second one, and now that it fingerprints on its own it can
 * be judged on its own rate instead of inflating a pooled issue.
 */
export function shouldReportMintFailure(kind: MintFailureKind): boolean {
  return kind !== "no_fee";
}

/**
 * One Sentry issue per kind, so a wallet refusing a send never again shares a
 * row with a transaction that reverted. Static strings rather than the
 * wallet's message, because the message carries addresses and amounts that
 * would split one fault into a hundred issues.
 */
export function mintFailureFingerprint(kind: MintFailureKind): string[] {
  return ["nft-mint-failed", kind];
}

/** A title that says what happened, instead of a minified function name. */
export function mintFailureTitle(kind: MintFailureKind): string {
  switch (kind) {
    case "permission_denied":
      return "nft mint refused by wallet";
    case "wallet_internal":
      return "nft mint failed inside the wallet";
    case "no_fee":
      return "nft mint had no fee balance";
    default:
      return "nft mint tx failed";
  }
}

/**
 * How many blocks the balance does cover, from the node's own refusal.
 *
 * "insufficient fee-currency balance: required 253979679387217500,
 * available 143304000000000000": a batch of 700 priced past what the wallet
 * held (26 Nov 2026). The fee grows with the batch, so a smaller one fits.
 * The margin covers the fixed part of the fee and a price that moves between
 * the two tries. Null when the message says nothing usable or when nothing
 * meaningfully smaller would fit.
 */
export function affordableCount(message: string, count: number): number | null {
  const m = /required\s+(\d+)\D+available\s+(\d+)/i.exec(message);
  if (!m || count <= 1) return null;
  let required: bigint;
  let available: bigint;
  try {
    required = BigInt(m[1]);
    available = BigInt(m[2]);
  } catch {
    return null;
  }
  if (required <= BigInt(0) || available <= BigInt(0) || available >= required) return null;
  const fits = Number((BigInt(count) * available * BigInt(80)) / (required * BigInt(100)));
  return fits >= 1 && fits < count ? fits : null;
}

/**
 * The batch to offer before the wallet is asked at all.
 *
 * The quoted fee is what the server prices the batch at with its buffer
 * (0.32 for 700 on 26 Nov 2026, when the node asked for 0.254 in reserve),
 * so a balance under the quote is a wallet that will be refused. Asking
 * anyway cost the player one prompt per fee currency and then silence.
 * Returns the whole batch when either figure is unknown: a missing price
 * must not block a mint that may well go through.
 */
export function batchWithinFunds(
  count: number,
  usd: number | null | undefined,
  funds: number | null,
): number {
  if (usd === null || usd === undefined || funds === null) return count;
  if (!(usd > 0) || funds >= usd) return count;
  return Math.max(0, Math.min(count, Math.floor((count * funds * 0.8) / usd)));
}
