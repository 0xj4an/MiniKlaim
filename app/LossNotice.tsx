"use client";

import { useEffect, useState } from "react";
import { LossCard, type Losses } from "@/app/LossCard";
import { track } from "@/lib/analytics";

const seenKey = (address: string) => `losses_seen_${address.toLowerCase()}`;

/**
 * Shows the raid card once per raid.
 *
 * "Once" used to mean "until the player taps the X": the card came back on
 * every visit until it was closed, which made old news look like new news.
 * Now the moment the card is on screen, that is the visit that saw it. The
 * mark is written then, not on close, so a reload or a second visit does not
 * repeat it. Whatever happens after that mark is a new raid and shows again,
 * and what piles up while the player is away arrives as one card, added up.
 *
 * The mark is the time the question was asked, not the time the answer
 * landed: a block taken in the second between the two belongs to the next
 * card, and with the later time it would belong to none.
 */
export function LossNotice({ address }: { address: string | null }) {
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
    const askedAt = Date.now();
    void fetch(
      `/api/users/${address.toLowerCase()}/losses${since ? `?since=${since}` : ""}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Losses | null) => {
        if (cancelled || !data) return;
        if (data.captured + data.attacked === 0) return;
        try {
          localStorage.setItem(seenKey(address), String(askedAt));
        } catch {
          // It will show again next visit, which is the safe direction.
        }
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

  return (
    <LossCard
      losses={losses}
      onGo={() => {
        track("loss_notice_action", { action: "go" });
        setLosses(null);
      }}
      onClose={() => {
        track("loss_notice_action", { action: "later" });
        setLosses(null);
      }}
    />
  );
}
