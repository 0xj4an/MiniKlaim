"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";

/**
 * What a player caught by the 29 Oct 2026 outage sees first: their blocks
 * are back, their name has to be picked again, and nothing about their
 * account was broken into.
 */
export function RecoveryNotice({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const closeWith = (via: "cta" | "later" | "backdrop") => {
    track("recovery_notice_dismissed", { via });
    onClose();
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => closeWith("backdrop")}
    >
      <div
        className="mx-6 flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-xl font-bold">
          {t("recovery.title")}
        </h2>
        <p className="text-sm text-zinc-700">{t("recovery.body")}</p>
        <p className="text-sm text-zinc-700">{t("recovery.name")}</p>
        <Link
          href="/me"
          onClick={() => closeWith("cta")}
          className="mt-1 rounded-full bg-orange-700 px-6 py-2 text-center text-sm font-semibold text-white hover:bg-orange-800"
        >
          {t("recovery.cta")} →
        </Link>
        <button
          onClick={() => closeWith("later")}
          className="text-xs text-zinc-500 underline"
        >
          {t("recovery.later")}
        </button>
      </div>
    </div>
  );
}
