import type { FeeCurrency } from "@/lib/onchain/chains";
import {
  isUnpayableFee,
  isUnsupportedFeeCurrency,
} from "@/lib/wallet/playerFee";

/**
 * Fee options in the order we try them: each held stablecoin, then native
 * CELO. A stablecoin with dust in it counts as "held" but cannot cover the
 * fee, and the node only tells us at send time. Without the CELO step a
 * player holding CELO plus a little USDm is stuck: their tx fails and the
 * relayer refuses because they can pay (seen Oct 2026, 0xf43982794554e2ce3b20d4c642beaf9291c50ddc).
 */
export function feeAttempts(held: FeeCurrency[]): (FeeCurrency | undefined)[] {
  return [...held, undefined];
}

/**
 * Send with the first fee option that works. Moves on when the node refuses
 * the fee, and when the wallet cannot do fee abstraction at all — a browser
 * wallet rejects `feeCurrency` outright, and stopping there left every such
 * player unable to act. A decline still stops at once, so the player is
 * never asked twice for one claim.
 */
export async function sendWithFeeFallback<T>(
  held: FeeCurrency[],
  send: (fee: FeeCurrency | undefined) => Promise<T>,
  onShort?: (fee: FeeCurrency | undefined, next: FeeCurrency | undefined) => void,
): Promise<{ result: T; fee: FeeCurrency | undefined }> {
  const attempts = feeAttempts(held);
  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const fee = attempts[i];
    try {
      return { result: await send(fee), fee };
    } catch (e) {
      lastError = e;
      if (i + 1 < attempts.length) {
        if (isUnpayableFee(e)) {
          onShort?.(fee, attempts[i + 1]);
          continue;
        }
        // Not a shortfall, so `onShort` stays quiet: the player holds enough,
        // the wallet simply cannot spend it on gas.
        if (isUnsupportedFeeCurrency(e)) continue;
      }
      throw e;
    }
  }
  throw lastError;
}
