"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";

export function LegalFooter() {
  const { t } = useLocale();
  return (
    <footer
      data-legal-footer="tabs"
      className="mt-8 flex flex-col gap-2 border-t border-zinc-200 pt-6 text-xs text-zinc-500"
    >
      <nav aria-label={t("home.legal.aria")} className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/stats"
          className="inline-flex min-h-11 items-center underline hover:text-zinc-600"
        >
          {t("about.footer.stats")}
        </Link>
        <Link
          href="/privacy"
          className="inline-flex min-h-11 items-center underline hover:text-zinc-600"
        >
          {t("about.footer.privacy")}
        </Link>
        <Link
          href="/terms"
          className="inline-flex min-h-11 items-center underline hover:text-zinc-600"
        >
          {t("about.footer.terms")}
        </Link>
      </nav>
      <p>{t("about.footer.disclaimer")}</p>
    </footer>
  );
}
