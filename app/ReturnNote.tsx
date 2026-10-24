"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n";

const GAP_MS = 3 * 24 * 60 * 60 * 1000;
const KEY = "miniklaim.returnNote";

/**
 * Shown on the home screen when this wallet's last run started at least
 * three days ago. Dismiss sticks to that run, so a later run can surface
 * the note again after another gap. An open run keeps the resume button.
 */
export function ReturnNote({
  lastRunAt,
  hasActiveRun,
}: {
  lastRunAt: string | null;
  hasActiveRun: boolean;
}) {
  const { t } = useLocale();
  const [closed, setClosed] = useState(false);
  if (!lastRunAt || hasActiveRun || closed) return null;
  const at = new Date(lastRunAt).getTime();
  if (!Number.isFinite(at) || Date.now() - at < GAP_MS) return null;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(KEY) === lastRunAt;
  } catch {
    dismissed = false;
  }
  if (dismissed) return null;

  return (
    <p className="flex max-w-xs items-start justify-center gap-2 text-center text-xs leading-snug text-zinc-500">
      <span>{t("home.return.body")}</span>
      <button
        type="button"
        aria-label={t("home.return.dismiss")}
        className="shrink-0 leading-none text-zinc-400"
        onClick={() => {
          try {
            localStorage.setItem(KEY, lastRunAt);
          } catch {
            // Private mode can reject the write. Closing still hides it.
          }
          setClosed(true);
        }}
      >
        ×
      </button>
    </p>
  );
}
