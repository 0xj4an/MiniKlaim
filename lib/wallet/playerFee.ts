/**
 * Provider errors lead with a viem wrapper and bury the wallet's own message
 * under "Request Arguments". Prefer `details`, which is that message.
 */
export function errorText(e: unknown): string {
  const parts: string[] = [];
  if (e && typeof e === "object" && "details" in e) {
    const details = (e as { details?: unknown }).details;
    if (typeof details === "string") parts.push(details);
  }
  if (e instanceof Error) parts.push(e.message);
  else if (parts.length === 0) parts.push(String(e));
  return parts.join(" ");
}

/**
 * MiniPay reports some failures as a rejection: "User rejected transaction An
 * internal error was received", code 4001. Two thirds of the "rejections" we
 * logged (Oct 2026) were this, not a player closing the sheet.
 */
export function isWalletInternalError(e: unknown): boolean {
  return errorText(e).toLowerCase().includes("internal error");
}

/**
 * The player closed the wallet sheet. That is not a reason for the relayer to
 * pay. A fee shortfall or a wallet-internal error wearing a rejection code is
 * not a decline.
 */
export function isUserRejection(e: unknown): boolean {
  if (isUnpayableFee(e) || isWalletInternalError(e)) return false;
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (code === 4001 || code === "ACTION_REJECTED") return true;
  }
  const text = errorText(e).toLowerCase();
  return text.includes("user rejected") || text.includes("user denied");
}

/** The node refused the fee token, or the wallet has nothing to pay with. */
export function isUnpayableFee(e: unknown): boolean {
  const text = errorText(e).toLowerCase();
  return (
    text.includes("insufficient fee-currency") ||
    text.includes("insufficient funds")
  );
}

/**
 * The wallet cannot send a CIP-64 fee-currency transaction at all.
 *
 * MiniPay and the other Celo-native wallets accept `feeCurrency`; MetaMask,
 * Rabby and most browser wallets reject the field outright. That is a wallet
 * error, not a fee shortfall, so without this the fee fallback stopped on its
 * first attempt and the action could never go through. Every player holding
 * any Celo stablecoin in a browser wallet was blocked from claiming a run,
 * minting, claiming badges or rewards, and linking a wallet (found 29 Oct
 * 2026 from a MetaMask link that could not be completed).
 *
 * A decline is never this: the player closing the sheet must not be retried
 * with the next fee option, or they get asked twice for one action.
 */
export function isUnsupportedFeeCurrency(e: unknown): boolean {
  if (isUserRejection(e)) return false;
  const text = errorText(e).toLowerCase();
  // The wallet named the field it choked on.
  if (text.includes("feecurrency") || text.includes("fee currency")) return true;
  // JSON-RPC "invalid params", which is what a wallet returns for a field it
  // does not know.
  if (e && typeof e === "object" && "code" in e) {
    if ((e as { code?: unknown }).code === -32602) return true;
  }
  return (
    text.includes("unsupported transaction type") ||
    text.includes("invalid params") ||
    text.includes("invalid argument") ||
    text.includes("unknown property") ||
    text.includes("unknown field") ||
    text.includes("unrecognized") ||
    text.includes("not supported") ||
    text.includes("does not support")
  );
}

/**
 * Balances have loaded and the player holds none of this chain's fee tokens.
 * A still-loading read is not "no balance": sponsoring then would pay for
 * everyone whose multicall has not returned yet.
 */
export function playerHasNoFeeBalance(
  feeCurrencyCount: number,
  heldCount: number,
  balances: { isLoading: boolean; isError: boolean },
): boolean {
  return (
    feeCurrencyCount > 0 &&
    heldCount === 0 &&
    !balances.isLoading &&
    !balances.isError
  );
}
