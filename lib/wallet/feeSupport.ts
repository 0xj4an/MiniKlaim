"use client";

import { isMiniPay } from "@/lib/minipay";
import { heldFeeAdapters, type FeeCurrency } from "@/lib/onchain/chains";
import type { TokenSymbol } from "@/lib/tokens";

/**
 * Whether the wallet the app is running in can pay gas in a stablecoin.
 *
 * Paying gas in a token is Celo's CIP-64, and the wallet has to build that
 * transaction type. MiniPay does; MetaMask, Rabby and the other browser
 * wallets reject the `feeCurrency` field outright, so outside MiniPay gas is
 * paid in CELO.
 *
 * Offering the token first to a wallet that cannot use it is not a harmless
 * try: each refused attempt is another signature sheet in the player's face
 * before the one that works.
 */
export function walletPaysGasInToken(): boolean {
  return isMiniPay();
}

/**
 * The stablecoins worth offering as gas, given both the balances and the
 * wallet. Empty outside MiniPay, which leaves `feeAttempts` with native CELO
 * alone — one prompt, the one that can succeed.
 */
export function heldFeeAdaptersForWallet(
  feeCurrencies: FeeCurrency[],
  balances: Partial<Record<TokenSymbol, { value: bigint } | null>>,
): FeeCurrency[] {
  if (!walletPaysGasInToken()) return [];
  return heldFeeAdapters(feeCurrencies, balances);
}
