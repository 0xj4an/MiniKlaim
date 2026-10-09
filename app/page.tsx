import Link from "next/link";
import { LogoWordmark } from "./Logo";
import { HomeClient } from "./HomeClient";
import { serverT } from "@/lib/i18nServer";

export default async function HomePage() {
  const { t } = await serverT();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-12 pb-24">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        {/* Rewards Campaign Banner */}
        <div className="w-full rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 p-[2px] shadow-lg">
          <div className="rounded-[10px] bg-white px-4 py-3">
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl">🎁</span>
              <div className="flex flex-col items-start">
                <span className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                  Coming Soon
                </span>
                <span className="text-sm font-bold text-zinc-900">
                  Rewards Campaign
                </span>
              </div>
              <span className="text-2xl">✨</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <LogoWordmark height={48} />
          <h1 className="text-3xl leading-tight font-bold text-zinc-900">
            {t("home.tagline")}
          </h1>
        </div>
        <HomeClient />
        {/* Legal links surface here because MiniPay listing requires
            Privacy and Terms to be linkable from the home surface, and
            PostHog data showed 0 discovery via the /about footer. */}
        <nav
          aria-label={t("home.legal.aria")}
          className="mt-2 flex items-center gap-4 text-xs text-zinc-400"
        >
          <Link
            href="/privacy"
            className="hover:text-zinc-600 hover:underline"
          >
            {t("about.footer.privacy")}
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="hover:text-zinc-600 hover:underline">
            {t("about.footer.terms")}
          </Link>
        </nav>
      </div>
    </main>
  );
}
