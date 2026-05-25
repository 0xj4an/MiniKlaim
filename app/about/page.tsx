"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n";

export default function AboutPage() {
  const { t } = useLocale();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-8">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← {t("common.home")}
        </Link>
        <h1 className="text-xl font-bold">{t("about.title")}</h1>
        <span className="w-16" />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("about.howTo.header")}</h2>
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
        <h2 className="text-xl font-semibold">{t("about.faq.header")}</h2>
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
        <h2 className="text-xl font-semibold">{t("about.contact.header")}</h2>
        <p className="text-sm leading-relaxed text-zinc-700">
          {t("about.contact.body")}{" "}
          <a
            href="https://x.com/0xj4an"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            {t("about.contact.handle")}
          </a>
          .
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("about.sla.header")}</h2>
        <p className="text-sm leading-relaxed text-zinc-700">
          {t("about.sla.body")}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{t("about.trust.header")}</h2>
        <div className="text-sm text-zinc-700">
          <p className="mb-1 font-medium text-zinc-900">
            {t("about.trust.contractsLabel")}
          </p>
          <ul className="ml-4 list-disc space-y-0.5 font-mono text-xs">
            <li>
              MiniKlaimHexes (ERC-721):{" "}
              <a
                href="https://celoscan.io/address/0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-700 underline"
              >
                0xf3C1…cb47
              </a>
            </li>
            <li>
              MiniKlaimBadges (ERC-1155 soulbound):{" "}
              <a
                href="https://celoscan.io/address/0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-700 underline"
              >
                0xa9ab…Abd8
              </a>
            </li>
          </ul>
        </div>

        <div className="text-sm text-zinc-700">
          <p className="mb-1 font-medium text-zinc-900">
            {t("about.trust.txLabel")}
          </p>
          <ul className="ml-4 list-disc space-y-0.5 font-mono text-xs">
            <li>
              <a
                href="https://celoscan.io/tx/0x544b5c40867a30dac75b52588bb5940d2ba75106c4b9bc83aaf5fd34fac53fa8"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-700 underline"
              >
                0x544b…3fa8
              </a>{" "}
              <span className="font-sans text-zinc-500">
                captureBatch, 43 hexes minted
              </span>
            </li>
            <li>
              <a
                href="https://celoscan.io/tx/0x6ce074071f3bfb74bbcf5a46f7f86ff52f2c97bffe5a91db42e36efcbf0978de"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-700 underline"
              >
                0x6ce0…78de
              </a>{" "}
              <span className="font-sans text-zinc-500">
                captureBatch, single hex
              </span>
            </li>
            <li>
              <a
                href="https://celoscan.io/tx/0x9523977e5bbc34e772c535c5323fa14fb36ba6e0e17427053e0ee0a905e72792"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-700 underline"
              >
                0x9523…2792
              </a>{" "}
              <span className="font-sans text-zinc-500">
                captureBatch, single hex
              </span>
            </li>
          </ul>
        </div>

        <div className="text-sm text-zinc-700">
          <p className="mb-1 font-medium text-zinc-900">
            {t("about.trust.originsLabel")}
          </p>
          <ul className="ml-4 list-disc space-y-0.5 text-xs">
            <li>
              <span className="font-mono">forno.celo.org</span> —{" "}
              {t("about.trust.origins.celoRpc")}
            </li>
            <li>
              <span className="font-mono">basemaps.cartocdn.com</span> —{" "}
              {t("about.trust.origins.cartoMap")}
            </li>
            <li>
              <span className="font-mono">api.etherscan.io</span> —{" "}
              {t("about.trust.origins.celoscan")}
            </li>
            <li>
              <span className="font-mono">metamask.app.link</span> —{" "}
              {t("about.trust.origins.metamaskDeeplink")}
            </li>
            <li>
              <span className="font-mono">warpcast.com</span> —{" "}
              {t("about.trust.origins.warpcast")}
            </li>
          </ul>
        </div>
      </section>

      <footer className="mt-8 flex flex-col gap-2 border-t border-zinc-200 pt-6 text-xs text-zinc-500">
        <div className="flex gap-4">
          <Link href="/stats" className="underline hover:text-zinc-600">
            {t("about.footer.stats")}
          </Link>
          <Link href="/privacy" className="underline hover:text-zinc-600">
            {t("about.footer.privacy")}
          </Link>
          <Link href="/terms" className="underline hover:text-zinc-600">
            {t("about.footer.terms")}
          </Link>
        </div>
        <p>{t("about.footer.disclaimer")}</p>
      </footer>
    </main>
  );
}
