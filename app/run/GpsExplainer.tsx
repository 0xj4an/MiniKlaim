"use client";

import { useLocale } from "@/lib/i18n";

/**
 * Shown once per device before the browser asks for location. The button is
 * the user gesture that fires the permission prompt, which MiniPay iOS also
 * needs (see the eager primer in page.tsx).
 */
export function GpsExplainer({ onAllow }: { onAllow: () => void }) {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gps-explainer-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-left shadow-2xl"
      >
        <p
          id="gps-explainer-title"
          className="text-base font-bold text-zinc-900"
        >
          {t("run.gps.explain.title")}
        </p>
        <p className="mt-3 text-sm text-zinc-700">
          {t("run.gps.explain.body")}
        </p>
        <p className="mt-2 text-sm text-zinc-700">
          {t("run.gps.explain.privacy")}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {t("run.gps.explain.next")}
        </p>
        <button
          type="button"
          onClick={onAllow}
          className="mt-5 w-full rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white"
        >
          {t("run.gps.explain.allow")}
        </button>
      </div>
    </div>
  );
}
