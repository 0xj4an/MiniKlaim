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
