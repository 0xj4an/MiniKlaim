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

/**
 * The player has money but this wallet cannot spend it on gas.
 *
 * They hold stablecoins, the wallet cannot pay gas in a token, and they have
 * no CELO. Nothing they try will go through, and the relayer will not step in
 * either: it checks their balances server-side, sees enough, and refuses. So
 * say it before they try, instead of letting a transaction fail and leaving
 * them to guess why.
 *
 * False while the balances are still loading or failed to read, so the
 * warning never flashes at a player whose reads just have not come back.
 */
export function needsCeloForGas(
  feeCurrencies: FeeCurrency[],
  balances: Partial<Record<TokenSymbol, { value: bigint } | null>> & {
    celo: bigint | null;
    isLoading: boolean;
    isError: boolean;
  },
): boolean {
  if (balances.isLoading || balances.isError) return false;
  if (balances.celo === null || balances.celo > 0n) return false;
  if (walletPaysGasInToken()) return false;
  return heldFeeAdapters(feeCurrencies, balances).length > 0;
}
