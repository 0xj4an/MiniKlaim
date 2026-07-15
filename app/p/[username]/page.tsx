import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { serverT } from "@/lib/i18nServer";
import { badgeSvg } from "@/lib/onchain/badgeArt";
import { BADGE_GROUPS, evaluateBadges } from "@/lib/onchain/badgeCatalog";

type PublicProfile = {
  username: string;
  joinedAt: string;
  hexesOwned: number;
  totalRuns: number;
  bestRunHexes: number;
  bestRunDistanceMeters: number;
  streak: number;
  lifetimeDistanceMeters: number;
  cityCount: number;
  conquests: number;
  countryCount: number;
};

async function fetchProfile(username: string): Promise<PublicProfile | null> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = host ? `${proto}://${host}` : "";
  const res = await fetch(`${base}/api/profile/${username}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfile;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) {
    return { title: "Player not found - MiniKlaim" };
  }
  return {
    title: `@${profile.username} - MiniKlaim`,
    description: `${profile.hexesOwned} blocks captured across ${profile.totalRuns} runs.`,
  };
}


export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) notFound();

  const { locale, t } = await serverT();

  const bestKm =
    profile.bestRunDistanceMeters >= 1000
      ? `${(profile.bestRunDistanceMeters / 1000).toFixed(2)} km`
      : `${profile.bestRunDistanceMeters} m`;

  const badges = evaluateBadges(profile, locale === "es" ? "es" : "en");
  const byId = new Map(badges.map((b) => [b.onchainId, b]));
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  const joinedLabel = new Date(profile.joinedAt).toLocaleDateString(
    locale === "es" ? "es" : "en",
    { month: "short", year: "numeric" },
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← {t("common.home")}
        </Link>
        <h1 className="text-xl font-bold">{t("p.title")}</h1>
        <span className="w-16" />
      </header>

      <div className="flex flex-col items-center gap-1">
        <p className="text-2xl font-bold">
          <span className="text-zinc-500">@</span>
          <span>{profile.username}</span>
        </p>
        <p className="text-xs text-zinc-500">
          {t("p.joined")} {joinedLabel}
        </p>
      </div>

      <div className="flex justify-center gap-8 text-center">
        <BigStat label={t("p.stat.blocks")} value={profile.hexesOwned} />
        <BigStat label={t("p.stat.runs")} value={profile.totalRuns} />
        <BigStat
          label={
            profile.streak === 1 ? t("p.stat.dayStreak") : t("p.stat.daysStreak")
          }
          value={profile.streak}
        />
      </div>

      {(profile.bestRunHexes > 0 || profile.bestRunDistanceMeters > 0) && (
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-zinc-500">
          {profile.bestRunHexes > 0 && (
            <span>
              {t("p.bestRun")}{" "}
              <span className="font-semibold text-zinc-900">
                {profile.bestRunHexes} {t("p.bestRun.blocks")}
              </span>
            </span>
          )}
          {profile.bestRunDistanceMeters > 0 && (
            <span>
              {t("p.longest")}{" "}
              <span className="font-semibold text-zinc-900">{bestKm}</span>
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        <p className="mb-1 text-center text-xs text-zinc-500">
          {t("p.badges.header")} {unlockedCount} {t("p.badges.of")} {badges.length}
        </p>
        {BADGE_GROUPS.map((group) => (
          <div key={group.en} className="mt-2 first:mt-1">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              {locale === "es" ? group.es : group.en}
            </p>
            {group.ids.map((id) => {
              const b = byId.get(id);
              if (!b) return null;
              return (
                <div
                  key={b.onchainId}
                  className={`flex items-center justify-between gap-3 ${b.unlocked ? "text-zinc-900" : "text-zinc-500"}`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`inline-block h-7 w-7 shrink-0 ${b.unlocked ? "" : "opacity-40 grayscale"}`}
                      dangerouslySetInnerHTML={{
                        __html: badgeSvg(b.onchainId, 28),
                      }}
                    />
                    <span className={b.unlocked ? "font-semibold" : ""}>
                      {b.name}
                    </span>
                  </span>
                  <span className="text-xs text-zinc-500">{b.description}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <Link
        href="/"
        className="mt-2 self-center rounded-md bg-orange-700 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-800"
      >
        {t("p.cta.play")}
      </Link>
    </main>
  );
}

function BigStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-3xl font-bold text-zinc-900">{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}
