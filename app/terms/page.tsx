"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";

export default function TermsPage() {
  const { t } = useLocale();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link
          href="/about"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← {t("common.back")}
        </Link>
        <h1 className="text-2xl font-bold">{t("terms.title")}</h1>
        <span className="w-16" />
      </header>

      <p className="text-xs text-zinc-500">{t("common.lastUpdated")} 2026-05-20.</p>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.what.h")}
        </h2>
        <p>{t("terms.what.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.noWarranty.h")}
        </h2>
        <p>{t("terms.noWarranty.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.safety.h")}
        </h2>
        <p>{t("terms.safety.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.noMoney.h")}
        </h2>
        <p>{t("terms.noMoney.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.use.h")}
        </h2>
        <p>{t("terms.use.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.changes.h")}
        </h2>
        <p>{t("terms.changes.body")}</p>
      </section>
    </main>
  );
}
