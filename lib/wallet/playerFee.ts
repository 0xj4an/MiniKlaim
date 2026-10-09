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

/** The player closed the wallet sheet. That is not a reason for the relayer to pay. */
export function isUserRejection(e: unknown): boolean {
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
