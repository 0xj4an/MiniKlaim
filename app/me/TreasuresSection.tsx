"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { isTreasuresEnabled } from "@/lib/drops/config";
import { formatPrize } from "@/lib/drops/format";
import { useClaimTreasures } from "@/lib/drops/useClaimTreasures";

type Treasure = {
  findId: string;
  label: string | null;
  token: string;
  amount: string;
  claimTx: string | null;
  claimedAt: string | null;
};

/**
 * The player's won treasures with a one-tap claim for the unpaid ones. Hidden
 * when treasures are off or the player has none.
 */
export function TreasuresSection({ address }: { address: `0x${string}` | null }) {
  const { t, locale } = useLocale();
  const { claim, state } = useClaimTreasures(address, "me");
  const [treasures, setTreasures] = useState<Treasure[] | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!address || !isTreasuresEnabled()) return;
    let cancelled = false;
    void fetch(`/api/users/${address}/drops`)
      .then((r) => (r.ok ? r.json() : { treasures: [] }))
      .then((body: { treasures?: Treasure[] }) => {
        if (!cancelled) setTreasures(body.treasures ?? []);
      })
      .catch(() => {
        if (!cancelled) setTreasures([]);
      });
    return () => {
      cancelled = true;
    };
  }, [address, refresh]);

  // A sent claim settles from its receipt on the next read.
  useEffect(() => {
    if (state !== "sent") return;
    const id = window.setTimeout(() => setRefresh((n) => n + 1), 6000);
    return () => window.clearTimeout(id);
  }, [state]);

  if (!address || !treasures || treasures.length === 0) return null;
  const ready = treasures.filter((x) => !x.claimTx && !x.claimedAt);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <p className="text-center text-xs font-semibold text-amber-800">🎁 {t("treasures.h")}</p>
      <ul className="flex flex-col gap-1">
        {treasures.map((x) => (
          <li key={x.findId} className="flex items-center justify-between gap-2 text-zinc-800">
            <span className="truncate">
              {formatPrize(x.token, x.amount, locale)}
              {x.label ? ` · ${x.label}` : ""}
            </span>
            <span className="shrink-0 text-xs text-zinc-600">
              {x.claimedAt
                ? t("treasures.paid")
                : x.claimTx
                  ? t("treasures.onTheWay")
                  : t("treasures.ready")}
            </span>
          </li>
        ))}
      </ul>
      {ready.length > 0 && state !== "sent" && (
        <>
          <button
            onClick={() =>
              void claim(ready.length).then((ok) => ok && setRefresh((n) => n + 1))
            }
            disabled={state === "claiming"}
            className="mx-auto rounded-full bg-amber-600 px-6 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {state === "claiming" ? t("treasure.claiming") : t("treasure.claim")}
          </button>
          <p className="text-center text-xs text-amber-800">{t("treasure.free")}</p>
        </>
      )}
      {state === "sent" && <p className="text-center text-xs text-emerald-800">{t("treasure.sent")}</p>}
      {state === "error" && <p className="text-center text-xs text-red-700">{t("treasure.failed")}</p>}
    </div>
  );
}
