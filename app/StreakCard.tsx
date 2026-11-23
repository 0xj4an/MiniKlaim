"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { daysToNextRestDay, nextStreakBadge } from "@/lib/runs/streakMath";
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
 *
 * The third line is about rest days (lib/runs/streakMath): how many are
 * saved, that one just covered a missed day, or how far the next one is. A
 * player has to know the allowance exists for it to take the edge off a
 * missed day.
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
  const restDays = stats?.restDays ?? 0;
  const restCovering = stats?.restDaysCovering ?? 0;

  useEffect(() => {
    if (streak > 0) {
      track("home_streak_shown", {
        streak,
        rest_days: restDays,
        rest_covering: restCovering,
      });
    }
  }, [streak, restDays, restCovering]);

  if (!enabled || !stats || streak === 0) return null;

  const badgeDay = nextStreakBadge(streak);
  const toGo = badgeDay === null ? 0 : badgeDay - streak;
  const toRest = daysToNextRestDay(streak);
  const restLine =
    restCovering > 0
      ? t("home.streak.restCovered")
      : restDays > 0
        ? (restDays === 1 ? t("home.streak.rest.one") : t("home.streak.rest")).replace(
            "{n}",
            String(restDays),
          )
        : (toRest === 1 ? t("home.streak.restEarn.one") : t("home.streak.restEarn")).replace(
            "{d}",
            String(toRest),
          );

  return (
    <div className="mk-flat w-full px-4 py-3 text-left">
      <p className="text-[15px] leading-tight font-semibold text-zinc-900">
        🔥 {t("home.streak.days").replace("{n}", String(streak))}
      </p>
      <p className="mt-1 text-[13px] leading-tight text-zinc-600">
        {badgeDay === null
          ? t("home.streak.allBadges")
          : t("home.streak.toBadge")
              .replace("{d}", String(toGo))
              .replace("{m}", String(badgeDay))}
      </p>
      {/* Old servers send no rest days: say nothing rather than a wrong count. */}
      {stats.restDays !== undefined && (
        <p className="mt-0.5 text-[13px] leading-tight text-zinc-500">
          {restLine}
        </p>
      )}
    </div>
  );
}
