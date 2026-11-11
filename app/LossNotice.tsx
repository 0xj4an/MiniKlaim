"use client";

import { useEffect, useState } from "react";
import { CloseButton } from "@/app/CloseButton";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { shortAddress } from "@/lib/shortAddress";

type Losses = {
  captured: number;
  attacked: number;
  by: Array<{
    address: string;
    username: string | null;
    captured: number;
    attacked: number;
  }>;
};

const seenKey = (address: string) => `losses_seen_${address.toLowerCase()}`;

/**
 * "While you were away": the blocks other players took from this player and
 * the levels they knocked off, with names, since the last time the player
 * closed this card.
 *
 * Losing blocks was silent. The only trace was a smaller total, and a
 * player could drop a place in the ranking without knowing a contest was
 * on. Says who, so there is someone to go and take them back from.
 */
export function LossNotice({ address }: { address: string | null }) {
  const { t } = useLocale();
  const [losses, setLosses] = useState<Losses | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    let since = "";
    try {
      since = localStorage.getItem(seenKey(address)) ?? "";
    } catch {
      // No storage: the server's default window applies.
    }
    void fetch(
      `/api/users/${address.toLowerCase()}/losses${since ? `?since=${since}` : ""}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Losses | null) => {
        if (cancelled || !data) return;
        if (data.captured + data.attacked === 0) return;
        setLosses(data);
        track("loss_notice_shown", {
          captured: data.captured,
          attacked: data.attacked,
          players: data.by.length,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address || !losses) return null;

  const close = () => {
    try {
      localStorage.setItem(seenKey(address), String(Date.now()));
    } catch {
      // It will show again next visit, which is the safe direction.
    }
    setLosses(null);
  };

  const n = (
    key:
      | "home.losses.captured"
      | "home.losses.attacked"
      | "home.losses.took"
      | "home.losses.hit",
    count: number,
  ) => t(count === 1 ? `${key}.one` : key).replace("{n}", String(count));
  const parts = [
    losses.captured > 0 ? n("home.losses.captured", losses.captured) : null,
    losses.attacked > 0 ? n("home.losses.attacked", losses.attacked) : null,
  ].filter(Boolean);

  return (
    <div
      role="status"
      className="w-full max-w-xs rounded-2xl border border-red-200 bg-red-50 p-4 text-left shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-red-950">
          {t("home.losses.title")}
        </p>
        <CloseButton onClick={close} className="h-6 w-6 shrink-0" />
      </div>
      <p className="mt-1 text-[13px] leading-snug text-red-900">
        {parts.join(" · ")}
      </p>
      <ul className="mt-3 space-y-1.5">
        {losses.by.map((p) => (
          <li
            key={p.address}
            className="flex items-baseline justify-between gap-3 text-[13px] text-red-950"
          >
            <span className="min-w-0 truncate font-semibold">
              {p.username ?? shortAddress(p.address)}
            </span>
            <span className="shrink-0 text-xs text-red-800">
              {[
                p.captured > 0 ? n("home.losses.took", p.captured) : null,
                p.attacked > 0 ? n("home.losses.hit", p.attacked) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-snug text-red-800">
        {t("home.losses.hint")}
      </p>
    </div>
  );
}
