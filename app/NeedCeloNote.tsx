"use client";

import { useLocale } from "@/lib/i18n";
import { getChain } from "@/lib/onchain/chains";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { needsCeloForGas } from "@/lib/wallet/feeSupport";
import { useBalances } from "@/lib/wallet/useBalances";

/**
 * Shown to a player who holds stablecoins in a wallet that cannot spend them
 * on gas and has no CELO. Nothing they try would go through, and the relayer
 * refuses because it sees their balance server-side, so the useful thing is
 * to say so before they tap rather than after a transaction fails.
 */
export function NeedCeloNote({
  address,
  enabled,
}: {
  address: `0x${string}` | null;
  enabled: boolean;
}) {
  const { t } = useLocale();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, enabled && !!address);
  if (!enabled || !address) return null;
  if (!needsCeloForGas(getChain(chainKey).feeCurrencies, balances)) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">{t("fee.needCelo.title")}</p>
      <p className="mt-1">{t("fee.needCelo.body")}</p>
    </div>
  );
}
