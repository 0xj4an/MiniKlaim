import { cookies } from "next/headers";
import Link from "next/link";
import { LogoWordmark } from "./Logo";
import { HomeClient } from "./HomeClient";
import { NAMED_COOKIE } from "@/lib/namedCookie";
import { CampaignBanner } from "./CampaignBanner";
import { serverT } from "@/lib/i18nServer";
import { XLink } from "./XLink";

export default async function HomePage() {
  const { t } = await serverT();
  // A player who already has a name gets the game, not the pitch: a small
  // logo and their own card instead of the tagline. HomeClient sets the
  // cookie once it has seen a name, so the server can render the right
  // version on the first byte and nothing jumps when the wallet connects.
  const named = (await cookies()).get(NAMED_COOKIE)?.value === "1";
  return (
    <main
      className={`flex min-h-screen flex-col items-center gap-8 px-6 pb-24 ${named ? "py-8" : "justify-center py-12"}`}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        {named ? (
          <>
            <LogoWordmark height={32} />
            <h1 className="sr-only">{t("home.tagline")}</h1>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <LogoWordmark height={48} />
            <h1 className="text-3xl leading-tight font-bold text-zinc-900">
              {t("home.tagline")}
            </h1>
          </div>
        )}
        <HomeClient />
        {/* A real campaign in place of the "Coming Soon" placeholder: it
            links out, it can be closed, and it removes itself when the
            contest ends. Below the game, so it never pushes Start down. */}
        <CampaignBanner />
        {/* Legal links surface here because MiniPay listing requires
            Privacy and Terms to be linkable from the home surface, and
            PostHog data showed 0 discovery via the /about footer. */}
        <nav
          aria-label={t("home.legal.aria")}
          className="mt-2 flex items-center gap-4 text-xs text-zinc-400"
        >
          <Link href="/privacy" className="hover:text-zinc-600 hover:underline">
            {t("about.footer.privacy")}
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="hover:text-zinc-600 hover:underline">
            {t("about.footer.terms")}
          </Link>
        </nav>
        <XLink
          label={t("about.footer.x")}
          className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
        />
      </div>
    </main>
  );
}
