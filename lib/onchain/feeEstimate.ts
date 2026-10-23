/**
 * Pure helpers to show a player what saving a run will cost before the wallet
 * opens. No I/O and no Node imports, so the client can format what the
 * `/api/onchain/fee-estimate` route returns.
 */

/** FeeCurrencyDirectory rate: USDm per CELO, both 18-decimal scaled. */
export type UsdRate = { numerator: bigint; denominator: bigint };

/**
 * Fee in US dollars for `gas` at `gasPriceWei` (CELO wei per gas), using the
 * USDm-per-CELO rate. USDm tracks the dollar, and MiniPay players pay in USDT,
 * which tracks it too.
 */
export function feeUsd(gas: bigint, gasPriceWei: bigint, rate: UsdRate): number {
  if (rate.denominator === 0n || gas <= 0n || gasPriceWei <= 0n) return 0;
  const usdWei = (gas * gasPriceWei * rate.numerator) / rate.denominator;
  return Number(usdWei) / 1e18;
}

/**
 * "< $0.01" below a cent, else two decimals ("$0.04", "$0.40"). Players read
 * cents; a third decimal reads as noise.
 */
export function formatFeeUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return "";
  if (usd < 0.01) return "< $0.01";
  return `$${usd.toFixed(2)}`;
}

export type FeeEstimate = {
  /** Estimated fee in USD, or null when the chain reads failed. */
  usd: number | null;
  /** The relayer will pay: the player cannot cover it and has allowance left. */
  sponsored: boolean;
};
