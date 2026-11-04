"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { isTreasuresEnabled } from "@/lib/drops/config";
import { formatPrize } from "@/lib/drops/format";

type Hint = {
  id: string;
  label: string | null;
  clue: string | null;
  token: string;
  amount: string;
  maxWinners: number;
  winnersLeft: number;
  endsAt: string;
};

/**
 * Open treasures by spot name and prize. Hidden when there are none. The block
 * is never sent: walking the spot is how you find it.
 */
export function ActiveTreasures() {
  const { t, locale } = useLocale();
  const [hints, setHints] = useState<Hint[] | null>(null);

  useEffect(() => {
    if (!isTreasuresEnabled()) return;
    let cancelled = false;
    void fetch("/api/drops/active")
      .then((r) => (r.ok ? r.json() : { drops: [] }))
      .then((body: { drops?: Hint[] }) => {
        if (!cancelled) setHints(body.drops ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hints || hints.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
      <h2 className="text-center text-sm font-semibold text-amber-900">🎁 {t("treasures.active.h")}</h2>
      <p className="text-center text-xs text-amber-800">{t("treasures.active.body")}</p>
      <ul className="flex flex-col gap-1 text-sm text-zinc-800">
        {hints.map((h) => (
          <li key={h.id} className="flex flex-col">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{h.label ?? "?"}</span>
              <span className="shrink-0 font-medium">
                {formatPrize(h.token, h.amount, locale)}
                {h.maxWinners > 1 && (
                  <span className="ml-1 text-xs font-normal text-zinc-600">
                    {t("treasures.left").replace("{n}", String(h.winnersLeft))}
                  </span>
                )}
              </span>
            </span>
            {h.clue && <span className="text-xs text-zinc-600">{h.clue}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
