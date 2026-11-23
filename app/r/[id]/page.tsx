import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { serverT } from "@/lib/i18nServer";
import { fetchRunCard, placeLabel, statsLine } from "@/lib/share/runCard";

/**
 * A finished run's public page: what a shared run links to. The picture in
 * the preview comes from opengraph-image.tsx next to this file.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await fetchRunCard(id);
  if (!card) return { title: "Run not found - MiniKlaim" };
  const who = card.username ? `@${card.username}` : "A MiniKlaim player";
  const blocks = card.hexesClaimed === 1 ? "1 block" : `${card.hexesClaimed.toLocaleString("en-US")} blocks`;
  const title = `${who} captured ${blocks} - MiniKlaim`;
  const description = `${statsLine(card)}. Walk, bike, or drive. The blocks you cross are yours.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await fetchRunCard(id);
  if (!card) notFound();
  const { t, locale } = await serverT();
  const place = placeLabel(card.city, card.country, locale);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-6 pb-24">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="mk-tile px-3 py-1.5 text-sm font-semibold text-zinc-900"
        >
          MiniKlaim
        </Link>
        <h1 className="mk-title text-2xl">{t("r.title")}</h1>
        <span className="w-16" />
      </header>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="mk-title text-[1.75rem]">
          {card.username ? (
            <Link href={`/p/${card.username}`}>
              <span className="text-zinc-500">@</span>
              {card.username}
            </Link>
          ) : (
            t("r.player")
          )}
        </p>
        <p className="mt-4 text-7xl font-extrabold text-orange-700">
          {card.hexesClaimed.toLocaleString("en-US")}
        </p>
        <p className="text-base font-semibold text-zinc-800">
          {card.hexesClaimed === 1 ? t("r.blocks.one") : t("r.blocks")}
        </p>
        <p className="mt-3 text-sm text-zinc-600">{statsLine(card)}</p>
        {place && <p className="text-sm text-zinc-500">{place}</p>}
      </div>

      <p className="text-center text-sm text-zinc-600">{t("r.tagline")}</p>
      <Link
        href="/"
        className="mk-btn mx-auto px-6"
      >
        {t("p.cta.play")}
      </Link>
    </main>
  );
}
