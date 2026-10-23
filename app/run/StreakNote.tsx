"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { nextStreakBadge } from "@/lib/runs/streakMath";
import { useUserStats } from "@/lib/wallet/useUserStats";

/**
 * Day streak under the run summary: how many days in a row the player has
 * captured a block, and what tomorrow's run gets them. The streak is the
 * reason to come back on day 2, so it shows where the run ends, not only on
 * the profile.
 */
export function StreakNote({
  address,
  capturedThisRun,
}: {
  address: string | null;
  capturedThisRun: boolean;
}) {
  const { t } = useLocale();
  const stats = useUserStats(address);
  const streak = stats?.streak ?? 0;

  useEffect(() => {
    if (stats) track("streak_shown", { streak, captured: capturedThisRun });
  }, [stats, streak, capturedThisRun]);

  if (!address || !stats) return null;

  if (!capturedThisRun || streak === 0) {
    return (
      <p className="mt-3 text-center text-xs text-zinc-500">{t("run.streak.start")}</p>
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
