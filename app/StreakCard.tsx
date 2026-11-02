"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { nextStreakBadge } from "@/lib/runs/streakMath";
import { useUserStats } from "@/lib/wallet/useUserStats";

/**
 * The day streak on the home screen, with how far the next badge is.
 *
 * It used to appear only under a finished run, which meant a player saw
 * their streak at the one moment they had already decided to play. On the
 * home screen it is a reason to go out: the number is in front of them
 * before they choose.
 *
 * It also stops the streak from looking lost. A run that captures nothing
 * (no GPS fix, a couple of minutes on a plane) does not break a streak
 * that is alive, but the run summary used to say "start a streak" anyway
 * (2 Nov 2026: `streak_shown` with streak 7 and counted false, twice).
 * Here the streak is simply always shown while it exists.
 */
export function StreakCard({
  address,
  enabled,
}: {
  address: string | null;
  enabled: boolean;
}) {
  const { t } = useLocale();
  const stats = useUserStats(enabled ? address : null);
  const streak = stats?.streak ?? 0;

  useEffect(() => {
    if (streak > 0) track("home_streak_shown", { streak });
  }, [streak]);

  if (!enabled || !stats || streak === 0) return null;

  const badgeDay = nextStreakBadge(streak);
  const toGo = badgeDay === null ? 0 : badgeDay - streak;

  return (
    <div className="w-full max-w-xs rounded-xl bg-orange-50 px-4 py-2.5 text-center">
      <p className="text-sm font-semibold text-orange-700">
        🔥 {t("home.streak.days").replace("{n}", String(streak))}
      </p>
      <p className="mt-0.5 text-xs text-orange-700/80">
        {badgeDay === null
          ? t("home.streak.allBadges")
          : t("home.streak.toBadge")
              .replace("{d}", String(toGo))
              .replace("{m}", String(badgeDay))}
      </p>
    </div>
  );
}
