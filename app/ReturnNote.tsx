"use client";

import { useLocale } from "@/lib/i18n";

const GAP_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Shown on the home screen when this wallet's last run started at least
 * three days ago. It goes away on its own once they start another run.
 */
export function ReturnNote({
  lastRunAt,
  hasActiveRun,
}: {
  lastRunAt: string | null;
  hasActiveRun: boolean;
}) {
  const { t } = useLocale();
  if (!lastRunAt || hasActiveRun) return null;
  const at = new Date(lastRunAt).getTime();
  if (!Number.isFinite(at) || Date.now() - at < GAP_MS) return null;

  return (
    <p className="max-w-xs text-center text-xs leading-snug text-zinc-500">
      {t("home.return.body")}
    </p>
  );
}
