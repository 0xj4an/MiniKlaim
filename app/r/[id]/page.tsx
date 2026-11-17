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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          MiniKlaim
        </Link>
        <h1 className="text-xl font-bold">{t("r.title")}</h1>
        <span className="w-16" />
      </header>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-2xl font-bold">
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
        className="mx-auto rounded-full bg-orange-700 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-800"
      >
        {t("p.cta.play")}
      </Link>
    </main>
  );
}
