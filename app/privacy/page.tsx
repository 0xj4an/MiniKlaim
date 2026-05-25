"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";

export default function PrivacyPage() {
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
          <li>{t("privacy.stored.l1")}</li>
          <li>{t("privacy.stored.l2")}</li>
          <li>{t("privacy.stored.l3")}</li>
          <li>{t("privacy.stored.l4")}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.notStored.h")}
        </h2>
        <ul className="ml-6 list-disc">
          <li>{t("privacy.notStored.l1")}</li>
          <li>{t("privacy.notStored.l2")}</li>
          <li>{t("privacy.notStored.l3")}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.public.h")}
        </h2>
        <p>{t("privacy.public.body")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.deletion.h")}
        </h2>
        <p>
          {t("privacy.deletion.before")}{" "}
          <a
            href="https://x.com/0xj4an"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            {t("about.contact.handle")}
          </a>{" "}
          {t("privacy.deletion.after")}
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t("privacy.cookies.h")}
        </h2>
        <p>{t("privacy.cookies.body")}</p>
      </section>
    </main>
  );
}
