"use client";

import { useLocale } from "@/lib/i18n";
import { formatPrize } from "@/lib/drops/format";
import { useClaimTreasures } from "@/lib/drops/useClaimTreasures";

export type FoundTreasure = {
  dropId: string;
  label: string | null;
  token: string;
  amount: string;
};

/**
 * Shown on the run screen the moment a batch wins a treasure. One tap claims:
 * the relayer submits it, the player signs nothing.
 */
export function TreasureFound({
  address,
  found,
  onClose,
}: {
  address: string | null;
  found: FoundTreasure[];
  onClose: () => void;
}) {
  const { t, locale } = useLocale();
  const { claim, state } = useClaimTreasures(address, "run");
  if (found.length === 0) return null;
  const first = found[0];
  const prize = formatPrize(first.token, first.amount, locale);
  const body = first.label
    ? t("treasure.found.body").replace("{amount}", prize).replace("{place}", first.label)
    : t("treasure.found.bodyNoPlace").replace("{amount}", prize);

  return (
    <div
      role="status"
      className="absolute top-16 right-4 left-4 z-30 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-center shadow-lg"
    >
      <p className="text-base font-bold text-amber-900">🎁 {t("treasure.found.h")}</p>
      <p className="text-sm text-amber-900">{body}</p>
      {state === "sent" ? (
        <>
          <p className="text-sm font-medium text-emerald-800">{t("treasure.sent")}</p>
          <button onClick={onClose} className="mx-auto text-xs text-zinc-600 underline">
            OK
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => void claim(found.length)}
            disabled={state === "claiming" || !address}
            className="mx-auto rounded-full bg-amber-600 px-8 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {state === "claiming" ? t("treasure.claiming") : t("treasure.claim")}
          </button>
          <p className="text-xs text-amber-800">{t("treasure.free")}</p>
          {state === "error" && <p className="text-xs text-red-700">{t("treasure.failed")}</p>}
          <button onClick={onClose} className="mx-auto text-xs text-zinc-600 underline">
            {t("treasure.later")}
          </button>
        </>
      )}
    </div>
  );
}
