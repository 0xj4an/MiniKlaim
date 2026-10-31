/**
 * Sent with a sponsor request after the player's own tx already failed for a
 * reason other than a decline: the node refused the fee ("insufficient
 * fee-currency balance"; MiniPay sizes the fee above our balance check), or the
 * wallet itself errored ("An internal error was received", "User not
 * authenticated", "Only SecretKey is supported", its RPC host unreachable).
 * Either way the player cannot pay right now, so the server must not answer
 * "you can pay": on 20-21 Oct that dead end left 24 run claims and 23 badge
 * claims with nothing settled. Still bound by the run token and the daily cap.
 */
export const FEE_SHORTFALL_HEADER = "x-fee-shortfall";

export function shortfallHeaders(shortfall: boolean): Record<string, string> {
  return shortfall ? { [FEE_SHORTFALL_HEADER]: "1" } : {};
}

/**
 * Sent when this wallet can only pay gas in CELO, which is every wallet
 * except MiniPay: CIP-64's `feeCurrency` is what lets a stablecoin pay a
 * fee, and MetaMask and the rest reject the field outright.
 *
 * Without it the server answered "you can pay" to a player holding USDT and
 * no CELO — true of the balance, false of the wallet — and the claim died
 * there. The server cannot see which wallet is asking, so the client has to
 * say. Same trust as the shortfall header above, and bounded the same way:
 * the run token proves the run is theirs and the daily cap bounds the spend.
 */
export const FEE_NATIVE_ONLY_HEADER = "x-fee-native-only";

export function nativeOnlyHeaders(nativeOnly: boolean): Record<string, string> {
  return nativeOnly ? { [FEE_NATIVE_ONLY_HEADER]: "1" } : {};
}
