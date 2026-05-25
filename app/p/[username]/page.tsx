import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import type { TranslationKey } from "@/lib/i18nDict";
import { serverT } from "@/lib/i18nServer";

type PublicProfile = {
  username: string;
  joinedAt: string;
  hexesOwned: number;
  totalRuns: number;
  bestRunHexes: number;
  bestRunDistanceMeters: number;
  streak: number;
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

type Badge = {
  nameKey: TranslationKey;
  descKey: TranslationKey;
  unlocked: boolean;
};

function buildBadges(profile: PublicProfile): Badge[] {
  return [
    {
      nameKey: "badge.firstSteps.name",
      descKey: "badge.firstSteps.desc",
      unlocked: profile.totalRuns >= 1,
    },
    {
      nameKey: "badge.fiveBlocks.name",
      descKey: "badge.fiveBlocks.desc",
      unlocked: profile.hexesOwned >= 5,
    },
    {
      nameKey: "badge.mayor.name",
      descKey: "badge.mayor.desc",
      unlocked: profile.hexesOwned >= 20,
    },
    {
      nameKey: "badge.hundred.name",
      descKey: "badge.hundred.desc",
      unlocked: profile.hexesOwned >= 100,
    },
    {
      nameKey: "badge.threeDays.name",
      descKey: "badge.threeDays.desc",
      unlocked: profile.streak >= 3,
    },
    {
      nameKey: "badge.oneWeek.name",
      descKey: "badge.oneWeek.desc",
      unlocked: profile.streak >= 7,
    },
    {
      nameKey: "badge.twoWeeks.name",
      descKey: "badge.twoWeeks.desc",
      unlocked: profile.streak >= 14,
    },
    {
      nameKey: "badge.bigRun.name",
      descKey: "badge.bigRun.desc",
      unlocked: profile.bestRunHexes >= 5,
    },
    {
      nameKey: "badge.marathon.name",
      descKey: "badge.marathon.desc",
      unlocked: profile.bestRunDistanceMeters >= 10000,
    },
    {
      nameKey: "badge.iron.name",
      descKey: "badge.iron.desc",
      unlocked: profile.totalRuns >= 50,
    },
  ];
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

  const badges = buildBadges(profile);
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  const joinedLabel = new Date(profile.joinedAt).toLocaleDateString(
    locale === "es" ? "es" : "en",
    { month: "short", year: "numeric" },
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8">
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
        {badges.map((b) => (
          <div
            key={b.nameKey}
            className={`flex items-center justify-between gap-3 ${b.unlocked ? "text-zinc-900" : "text-zinc-500"}`}
          >
            <span className={b.unlocked ? "font-semibold" : ""}>
              {t(b.nameKey)}
            </span>
            <span className="text-xs text-zinc-500">{t(b.descKey)}</span>
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
