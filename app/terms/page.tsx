"use client";

import { useLocale } from "@/lib/i18n";
import { useRouter } from "next/navigation";

export default function TermsPage() {
  const { t } = useLocale();
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12 pb-24">
      <header className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← {t("common.back")}
        </button>
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
          {t("terms.noCheating.h")}
        </h2>
        <p>{t("terms.noCheating.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.noGuarantee.h")}
        </h2>
        <p>{t("terms.noGuarantee.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.changes.h")}
        </h2>
        <p>{t("terms.changes.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.lawArbitration.h")}
        </h2>
        <p>{t("terms.lawArbitration.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("terms.nftRisks.h")}
        </h2>
        <p>{t("terms.nftRisks.body")}</p>
      </section>
    </main>
  );
}
