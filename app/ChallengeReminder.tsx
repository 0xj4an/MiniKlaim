"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloseButton } from "@/app/CloseButton";
import { track } from "@/lib/analytics";
import {
  challengeReminder,
  type Reminder,
  type ReminderInput,
} from "@/lib/challenges/reminder";
import { useLocale } from "@/lib/i18n";
import { badgeCopy } from "@/lib/onchain/badgeArt";

const dismissKey = (challengeId: string, address: string) =>
  `challenge_reminder_${challengeId}_${address.toLowerCase()}`;

/**
 * Tells a player who paid to enter the weekly challenge that they are not in
 * the draw yet, at the top of the home screen: which badges are missing and
 * the one thing that fixes it. See lib/challenges/reminder for when.
 *
 * Closing it puts it away for half a day, not for good: the week has a
 * deadline and the ticket is already paid.
 */
export function ChallengeReminder({ address }: { address: string | null }) {
  const { t, locale } = useLocale();
  const [reminder, setReminder] = useState<Reminder | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void fetch(`/api/challenges/current?address=${address.toLowerCase()}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: ReminderInput | null) => {
        if (cancelled || !body?.challenge) return;
        let dismissedAt: number | null = null;
        try {
          const raw = localStorage.getItem(
            dismissKey(body.challenge.id, address),
          );
          dismissedAt = raw ? Number(raw) : null;
        } catch {
          // No storage: it shows, which is the safe direction.
        }
        const due = challengeReminder(body, Date.now(), dismissedAt);
        if (!due) return;
        setReminder(due);
        track("challenge_reminder_shown", {
          challenge: due.challengeId,
          missing: due.missing.length,
          action: due.action,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!address || !reminder) return null;

  const put = (action: "go" | "later") => {
    track("challenge_reminder_action", { action, kind: reminder.action });
    try {
      localStorage.setItem(
        dismissKey(reminder.challengeId, address),
        String(Date.now()),
      );
    } catch {
      // It comes back next visit.
    }
    setReminder(null);
  };

  const names = reminder.missing
    .map((id) => badgeCopy(id, locale === "es" ? "es" : "en").name)
    .join(" · ");
  const closes = new Date(reminder.closesAt).toLocaleString(
    locale === "es" ? "es-CO" : "en-US",
    { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  );
  const claim = reminder.action === "claim";

  return (
    <div
      role="status"
      className="relative w-full max-w-xs rounded-xl border border-violet-300 bg-violet-50 p-3 pr-9 text-left shadow-sm"
    >
      <CloseButton
        onClick={() => put("later")}
        className="absolute top-1 right-1 h-8 w-8 bg-transparent text-violet-400"
      />
      <p className="text-[10px] font-semibold tracking-wide text-violet-700 uppercase">
        🏆 {t("challenge.reminder.kicker")}
      </p>
      <p className="text-sm leading-tight font-semibold text-violet-950">
        {t(
          reminder.missing.length === 1
            ? "challenge.reminder.title.one"
            : "challenge.reminder.title",
        ).replace("{n}", String(reminder.missing.length))}
      </p>
      <p className="mt-0.5 text-xs text-zinc-700">{names}</p>
      <p className="mt-1 text-xs text-violet-900">
        {t(claim ? "challenge.reminder.claimWhy" : "challenge.reminder.runWhy")}{" "}
        {t("challenge.reminder.until").replace("{date}", closes)}
      </p>
      <Link
        href={claim ? "/me" : "/run"}
        onClick={() => put("go")}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800"
      >
        {t(claim ? "challenge.reminder.claim" : "challenge.reminder.run")}
      </Link>
    </div>
  );
}
