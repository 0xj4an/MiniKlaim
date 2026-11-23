import { cookies } from "next/headers";
import Link from "next/link";
import { HomeClient } from "./HomeClient";
import { NAMED_COOKIE } from "@/lib/namedCookie";
import { CampaignBanner } from "./CampaignBanner";
import { serverT } from "@/lib/i18nServer";
import { XLink } from "./XLink";

export default async function HomePage() {
  const { t } = await serverT();
  // A player who already has a name gets the game, not the pitch: their own
  // numbers on the band instead of the tagline. HomeClient sets the cookie
  // once it has seen a name, so the server can render the right version on
  // the first byte and nothing jumps when the wallet connects.
  const named = (await cookies()).get(NAMED_COOKIE)?.value === "1";
  return (
    <main className="flex min-h-screen flex-col pb-24">
      {/* The band, the player and the game are one client piece: what the
          band shows depends on the wallet. The server only tells it whether
          this browser already has a named player. */}
      <HomeClient namedHint={named} />
      <div className="mx-auto mt-3 flex w-full max-w-md flex-col items-center gap-3 px-4 text-center">
        {/* A real campaign in place of the "Coming Soon" placeholder: it
            links out, it can be closed, and it removes itself when the
            contest ends. Below the game, so it never pushes Start down. */}
        <CampaignBanner />
        {/* Legal links surface here because MiniPay listing requires
            Privacy and Terms to be linkable from the home surface, and
            PostHog data showed 0 discovery via the /about footer. */}
        <nav
          aria-label={t("home.legal.aria")}
          className="mt-2 flex items-center gap-4 text-xs text-zinc-500"
        >
          <Link href="/privacy" className="py-2 hover:underline">
            {t("about.footer.privacy")}
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="py-2 hover:underline">
            {t("about.footer.terms")}
          </Link>
        </nav>
        <XLink
          label={t("about.footer.x")}
          className="mk-tile px-4 py-2 text-sm font-semibold text-zinc-800"
        />
      </div>
    </main>
  );
}
