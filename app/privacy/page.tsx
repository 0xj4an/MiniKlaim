"use client";

import { useLocale } from "@/lib/i18n";
import { useRouter } from "next/navigation";

export default function PrivacyPage() {
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
        <h1 className="text-2xl font-bold">{t("privacy.title")}</h1>
        <span className="w-16" />
      </header>

      <p className="text-xs text-zinc-500">{t("common.lastUpdated")} 2026-05-20.</p>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.stored.h")}
        </h2>
        <p>{t("privacy.stored.intro")}</p>
        <ul className="ml-6 list-disc">
          <li>{t("privacy.stored.1")}</li>
          <li>{t("privacy.stored.2")}</li>
          <li>{t("privacy.stored.3")}</li>
          <li>{t("privacy.stored.4")}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.noSell.h")}
        </h2>
        <p>{t("privacy.noSell.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.blockchain.h")}
        </h2>
        <p>{t("privacy.blockchain.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.analytics.h")}
        </h2>
        <p>{t("privacy.analytics.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.control.h")}
        </h2>
        <p>{t("privacy.control.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.contact.h")}
        </h2>
        <p>
          {t("privacy.contact.body1")}{" "}
          <a
            href="mailto:personal@0xj4an.xyz"
            className="font-medium text-blue-600 hover:underline"
          >
            personal@0xj4an.xyz
          </a>
          . {t("privacy.contact.body2")}
        </p>
      </section>
    </main>
  );
}
