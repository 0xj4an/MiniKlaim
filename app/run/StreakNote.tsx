"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { nextStreakBadge } from "@/lib/runs/streakMath";
import { useUserStats } from "@/lib/wallet/useUserStats";

/**
 * Day streak under the run summary: how many days in a row the player has
 * had a run that counts (a new block, or real movement over their own
 * blocks), and what tomorrow's run gets them. The streak is the
 * reason to come back on day 2, so it shows where the run ends, not only on
 * the profile.
 */
export function StreakNote({
  address,
  countedThisRun,
}: {
  address: string | null;
  countedThisRun: boolean;
}) {
  const { t } = useLocale();
  const stats = useUserStats(address);
  const streak = stats?.streak ?? 0;

  useEffect(() => {
    if (stats) track("streak_shown", { streak, counted: countedThisRun });
  }, [stats, streak, countedThisRun]);

  if (!address || !stats) return null;

  // A run that captured nothing does not break a streak that is already
  // alive: the player still has the rest of the day. Telling them to
  // "start a streak" while they are seven days in reads as having lost it,
  // which is exactly what a run with no GPS fix produced on 2 Nov 2026:
  // `streak_shown` fired twice with streak 7 and counted false, and the
  // screen said start one. Only a player with no streak is starting one.
  if (streak === 0) {
    return (
      <p className="mt-3 text-center text-xs text-zinc-500">{t("run.streak.start")}</p>
    );
  }

  if (!countedThisRun) {
    return (
      <div className="mt-3 rounded-xl bg-zinc-100 px-3 py-2 text-center">
        <p className="text-sm font-semibold text-zinc-700">
          🔥 {t("run.streak.today").replace("{n}", String(streak))}
        </p>
        <p className="mt-0.5 text-xs text-zinc-600">{t("run.streak.keepAlive")}</p>
      </div>
    );
  }

  const tomorrow = streak + 1;
  const badgeDay = nextStreakBadge(streak);
  const next = (badgeDay === tomorrow ? t("run.streak.nextBadge") : t("run.streak.next"))
    .replaceAll("{m}", String(tomorrow));

  return (
    <div className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-center">
      <p className="text-sm font-semibold text-orange-700">
        🔥 {t("run.streak.today").replace("{n}", String(streak))}
      </p>
      <p className="mt-0.5 text-xs text-orange-700/80">{next}</p>
    </div>
  );
}
