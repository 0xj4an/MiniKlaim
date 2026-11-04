import { formatUnits } from "viem";
import { DROP_TOKENS, dropTokenByAddress } from "@/lib/drops/config";

/** "1 USDT", "5,000 COPm". Client-safe. */
export function formatPrize(token: string, amount: string, locale: string = "en"): string {
  const sym = dropTokenByAddress(token);
  if (!sym) return amount;
  const value = Number(formatUnits(BigInt(amount), DROP_TOKENS[sym].decimals));
  return `${value.toLocaleString(locale === "es" ? "es-CO" : "en-US", { maximumFractionDigits: 2 })} ${sym}`;
}
