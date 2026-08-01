"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";
import { LinkExisting } from "@/app/LinkExisting";

/**
 * Full-screen overlay shown when a connected wallet tries to open /run
 * without a username set yet. Nudges them to /me to pick one, with a
 * fallback to link an existing account.
 */
export function NeedNameOverlay() {
  const { t } = useLocale();
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-6 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
        <p className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
          {t("run.needName.kicker")}
        </p>
        <p className="text-base text-zinc-700">{t("run.needName.body")}</p>
        <Link
          href="/me"
          className="rounded-full bg-orange-700 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-800"
        >
          {t("run.needName.cta")} →
        </Link>
        <LinkExisting />
      </div>
    </div>
  );
}
