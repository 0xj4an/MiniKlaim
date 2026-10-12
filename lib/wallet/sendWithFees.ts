import type { FeeCurrency } from "@/lib/onchain/chains";
import { isUnpayableFee } from "@/lib/wallet/playerFee";

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
 * Send with the first fee option that works. Moves on only when the node
 * refuses the fee; any other error (a decline, a wallet error) stops at once
 * so the player is never asked twice for one claim.
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
      if (i + 1 < attempts.length && isUnpayableFee(e)) {
        onShort?.(fee, attempts[i + 1]);
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}
