/**
 * Sent with a sponsor request after the player's own tx was refused by the
 * node for the fee ("insufficient fee-currency balance"). MiniPay sizes the
 * fee from its own gas limit and fee cap, higher than our balance check, so
 * the server must not answer "you can pay" to a player whose wallet just
 * proved they cannot. Still bound by the run token and the daily cap.
 */
export const FEE_SHORTFALL_HEADER = "x-fee-shortfall";

export function shortfallHeaders(shortfall: boolean): Record<string, string> {
  return shortfall ? { [FEE_SHORTFALL_HEADER]: "1" } : {};
}
