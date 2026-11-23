"use client";

import Link from "next/link";
import { LegalFooter } from "@/app/LegalFooter";
import { SupportLink } from "@/app/SupportLink";
import { useLocale } from "@/lib/i18n";

export default function AboutPage() {
  const { t } = useLocale();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6 pb-24">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="mk-tile px-3 py-1.5 text-sm font-semibold text-zinc-900"
        >
          ← {t("common.home")}
        </Link>
        <h1 className="mk-title text-2xl">{t("about.title")}</h1>
        <span className="w-16" />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="mk-title text-2xl">{t("about.howTo.header")}</h2>
        <ol className="ml-6 list-decimal text-sm leading-relaxed text-zinc-700">
          <li>{t("about.howTo.step1")}</li>
          <li>{t("about.howTo.step2")}</li>
          <li>
            {t("about.howTo.step3.before")}{" "}
            <span className="font-medium">{t("about.howTo.step3.cta")}</span>{" "}
            {t("about.howTo.step3.after")}
          </li>
          <li>{t("about.howTo.step4")}</li>
          <li>
            {t("about.howTo.step5.before")}{" "}
            <span className="font-medium">{t("about.howTo.step5.cta")}</span>{" "}
            {t("about.howTo.step5.after")}
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mk-title text-2xl">{t("about.faq.header")}</h2>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">{t("about.faq.q1")}</p>
          <p>{t("about.faq.a1")}</p>
        </div>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">{t("about.faq.q2")}</p>
          <p>{t("about.faq.a2")}</p>
        </div>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">{t("about.faq.q3")}</p>
          <p>{t("about.faq.a3")}</p>
        </div>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">{t("about.faq.q4")}</p>
          <p>{t("about.faq.a4")}</p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mk-title text-2xl">{t("about.contact.header")}</h2>
        <p className="text-sm leading-relaxed text-zinc-700">
          {t("about.contact.body")}{" "}
          <SupportLink className="text-orange-700 underline" openFromUrl />
          .
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="mk-title text-2xl">{t("about.sla.header")}</h2>
        <p className="text-sm leading-relaxed text-zinc-700">
          {t("about.sla.body")}
        </p>
      </section>

      <LegalFooter />
    </main>
  );
}
