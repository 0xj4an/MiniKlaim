"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloseButton } from "@/app/CloseButton";
import { track } from "@/lib/analytics";
import {
  type EntryStanding,
  reminderDue,
  reminderKey,
} from "@/lib/challenges/standing";
import { useLocale } from "@/lib/i18n";

/**
 * A player who paid the challenge entry and does not hold its badges yet is
 * not in the draw, and nothing told them so. This says it once every twelve
 * hours while the challenge is open, with the one thing to do about it.
 *
 * Sits under the pending-claim prompt (z-40 against its z-50): claiming a
 * run is often exactly what earns the missing badges.
 */
export function ChallengeReminder({
  challengeId,
  standing,
  total,
  closesLabel,
}: {
  challengeId: string;
  standing: Exclude<EntryStanding, { state: "in" }>;
  total: number;
  closesLabel: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let due = true;
    try {
      due = reminderDue(localStorage.getItem(reminderKey(challengeId)), Date.now());
      if (due) localStorage.setItem(reminderKey(challengeId), String(Date.now()));
    } catch {
      // No storage (private mode): show it; it is one tap to close.
    }
    if (!due) return;
    setOpen(true);
    track("challenge_reminder_shown", {
      challenge: challengeId,
      state: standing.state,
      missing: standing.missing,
    });
    // Once per mount: a refresh of the card must not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId]);

  if (!open) return null;

  const act = (action: "go" | "later") => {
    track("challenge_reminder_action", { challenge: challengeId, action });
    setOpen(false);
  };
  const claim = standing.state === "claim";

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={() => act("later")}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CloseButton
          onClick={() => act("later")}
          label={t("challenge.reminder.later")}
          className="absolute top-3 right-3"
        />
        <p className="px-8 text-center text-base font-bold text-zinc-900">
          🏆 {t("challenge.reminder.title")}
        </p>
        <p className="mt-2 text-center text-sm text-zinc-600">
          {t("challenge.reminder.body")
            .replace("{n}", String(standing.missing))
            .replace("{m}", String(total))}
        </p>
        <p className="mt-2 text-center text-sm font-medium text-zinc-900">
          {t(claim ? "challenge.reminder.claim" : "challenge.reminder.run")}
        </p>
        <p className="mt-1 text-center text-xs text-zinc-500">
          {t("challenge.endsAt").replace("{date}", closesLabel)}
        </p>
        <Link
          href={claim ? "/me" : "/run"}
          onClick={() => act("go")}
          className="mt-5 block w-full rounded-full bg-violet-700 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-violet-800"
        >
          {t(claim ? "challenge.reminder.ctaClaim" : "challenge.reminder.ctaRun")}
        </Link>
      </div>
    </div>
  );
}
