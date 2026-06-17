"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { BadgeClaimPrompt } from "@/app/BadgeClaimPrompt";
import { badgeCopy, badgeSvg } from "@/lib/onchain/badgeArt";
import { type Balance, useBalances } from "@/lib/wallet/useBalances";
import { type UseUser, useUser } from "@/lib/wallet/useUser";
import { type UserBadges, useUserBadges } from "@/lib/wallet/useUserBadges";
import { useUserRuns } from "@/lib/wallet/useUserRuns";
import { type UserStats, useUserStats } from "@/lib/wallet/useUserStats";
import { useWallet } from "@/lib/wallet/useWallet";
import { type TokenSymbol } from "@/lib/tokens";

const TerritoryMap = dynamic(
  () => import("./TerritoryMap").then((m) => m.TerritoryMap),
  { ssr: false },
);

export default function MePage() {
  const { address, isConnected, isWrongChain, disconnect, isMiniPay } =
    useWallet();
  const { t } = useLocale();
  const userInfo = useUser(isConnected ? address : null);
  const stats = useUserStats(isConnected && !isWrongChain ? address : null);
  const recentRuns = useUserRuns(
    isConnected && !isWrongChain ? address : null,
    50,
  );
  const balances = useBalances(address, isConnected && !isWrongChain);
  const onchainBadges = useUserBadges(
    isConnected && !isWrongChain ? address : null,
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
        <h1 className="text-xl font-bold">{t("me.title")}</h1>
        <button
          onClick={() => window.location.reload()}
          aria-label={t("me.refresh")}
          className="flex h-8 w-16 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      </header>

      {!isConnected && (
        <p className="text-center text-sm text-zinc-500">
          {t("me.signInPrompt.before")}{" "}
          <Link href="/" className="text-blue-600 underline">
            {t("me.signInPrompt.link")}
          </Link>{" "}
          {t("me.signInPrompt.after")}
        </p>
      )}

      {isConnected && (
        <>
          <div className="flex flex-col items-center gap-1">
            <UsernameBlock userInfo={userInfo} />
          </div>

          {stats && !isWrongChain && (
            <>
              <div className="flex justify-center gap-8 text-center">
                <BigStat label={t("me.stat.blocks")} value={stats.hexesOwned} />
                <BigStat label={t("me.stat.runs")} value={stats.totalRuns} />
                <BigStat
                  label={
                    stats.streak === 1
                      ? t("me.stat.dayStreak")
                      : t("me.stat.daysStreak")
                  }
                  value={stats.streak}
                />
              </div>

              {(stats.bestRunHexes > 0 || stats.hexesOwned > 0) && (
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-zinc-500">
                  {stats.hexesMinted > 0 && (
                    <span>
                      <span className="font-semibold text-zinc-900">
                        {stats.hexesMinted}
                      </span>{" "}
                      {t("me.onchain.suffix")}
                    </span>
                  )}
                  {stats.bestRunHexes > 0 && (
                    <span>
                      {t("me.bestRun.label")}{" "}
                      <span className="font-semibold text-zinc-900">
                        {stats.bestRunHexes} {t("me.bestRun.suffix")}
                      </span>
                    </span>
                  )}
                  {stats.hexesOwned > 0 && (
                    <span>
                      {t("me.rank.before")}{" "}
                      <span className="font-semibold text-zinc-900">
                        #{stats.rank}
                      </span>{" "}
                      {t("me.rank.after")}
                    </span>
                  )}
                </div>
              )}

              <Achievements stats={stats} onchain={onchainBadges} />
              <BadgeClaimPrompt
                address={address ?? null}
                enabled={isConnected && !isWrongChain}
              />
            </>
          )}

          {address && <TerritoryMap address={address} />}

          {recentRuns && recentRuns.length > 0 && (
            <RunsList runs={recentRuns} />
          )}

          {balances && !isWrongChain && <BalancesCard balances={balances} />}

          {!isMiniPay && (
            <button
              onClick={disconnect}
              className="mt-2 self-center text-xs text-zinc-500 underline hover:text-zinc-700"
            >
              {t("me.signOut")}
            </button>
          )}
        </>
      )}
    </main>
  );
}

function CopyProfileLink({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useLocale();

  async function onShare() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/p/${username}`;
    const text = `Check my MiniKlaim profile: @${username}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "MiniKlaim", text, url });
        return;
      } catch {
        // user cancelled or share unsupported, fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  }

  return (
    <button
      onClick={onShare}
      className="text-zinc-500 underline hover:text-zinc-600"
    >
      {copied ? t("me.share.copied") : t("me.share.button")}
    </button>
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

function UsernameBlock({ userInfo }: { userInfo: UseUser }) {
  const { user, isLoading, setUsername } = userInfo;
  const { t } = useLocale();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) {
    return <p className="text-sm text-zinc-500">{t("common.loading")}</p>;
  }
  if (user?.username && !isEditing) {
    return (
      <div className="flex flex-col items-center gap-1">
        <p className="text-2xl font-bold">
          <span className="text-zinc-500">@</span>
          <span>{user.username}</span>
        </p>
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => {
              setInput(user.username ?? "");
              setError(null);
              setIsEditing(true);
            }}
            className="text-zinc-500 underline hover:text-zinc-600"
          >
            {t("me.username.edit")}
          </button>
          <CopyProfileLink username={user.username} />
        </div>
      </div>
    );
  }

  async function onSave() {
    if (!input.trim()) return;
    setIsSaving(true);
    setError(null);
    const result = await setUsername(input.trim());
    setIsSaving(false);
    if (result.ok) {
      setInput("");
      setIsEditing(false);
    } else {
      setError(result.error ?? "Something went wrong");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave();
      }}
      className="flex flex-col items-center gap-2"
    >
      <p className="text-sm text-zinc-700">
        {user?.username ? t("me.username.change") : t("me.username.pick")}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t("me.username.placeholder")}
          maxLength={20}
          disabled={isSaving}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-44 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isSaving || !input.trim()}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
        >
          {isSaving ? t("me.username.saving") : t("me.username.save")}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setInput("");
              setError(null);
            }}
            disabled={isSaving}
            className="text-xs text-zinc-500 underline hover:text-zinc-700"
          >
            {t("me.username.cancel")}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}

type Achievement = {
  onchainId: number;
  name: string;
  description: string;
  unlocked: boolean;
};

function buildAchievements(
  stats: UserStats,
  locale: "en" | "es",
): Achievement[] {
  // [onchainId, unlocked predicate]. Keep ids in sync with BADGE_IDS and
  // computeEligibleBadgeIds in lib/onchain/badgeEligibility.ts.
  const defs: Array<[number, boolean]> = [
    // Territory.
    [1, stats.hexesOwned >= 1],
    [2, stats.hexesOwned >= 5],
    [3, stats.hexesOwned >= 20],
    [4, stats.hexesOwned >= 100],
    [5, stats.hexesOwned >= 250],
    [6, stats.hexesOwned >= 500],
    [7, stats.hexesOwned >= 1000],
    [8, stats.hexesOwned >= 2500],
    [9, stats.hexesOwned >= 10000],
    // Runs.
    [10, stats.totalRuns >= 1],
    [11, stats.totalRuns >= 50],
    [12, stats.totalRuns >= 100],
    [13, stats.totalRuns >= 250],
    [14, stats.totalRuns >= 500],
    [15, stats.totalRuns >= 1000],
    // Single-run feats.
    [16, stats.bestRunHexes >= 5],
    [17, stats.bestRunDistanceMeters >= 10000],
    [18, stats.bestRunDistanceMeters >= 21000],
    [19, stats.bestRunDistanceMeters >= 42000],
    // Lifetime distance.
    [20, stats.lifetimeDistanceMeters >= 50000],
    [21, stats.lifetimeDistanceMeters >= 100000],
    [22, stats.lifetimeDistanceMeters >= 500000],
    [23, stats.lifetimeDistanceMeters >= 1000000],
    [24, stats.lifetimeDistanceMeters >= 5000000],
    [25, stats.lifetimeDistanceMeters >= 40000000],
    // Streaks.
    [26, stats.streak >= 3],
    [27, stats.streak >= 7],
    [28, stats.streak >= 14],
    [29, stats.streak >= 30],
    [30, stats.streak >= 60],
    [31, stats.streak >= 90],
    [32, stats.streak >= 180],
    [33, stats.streak >= 365],
    // Cities.
    [34, stats.cityCount >= 1],
    [35, stats.cityCount >= 3],
    [36, stats.cityCount >= 10],
    [37, stats.cityCount >= 25],
    [38, stats.cityCount >= 50],
    [39, stats.cityCount >= 100],
    [40, stats.cityCount >= 250],
    [41, stats.cityCount >= 500],
    [42, stats.cityCount >= 1000],
    // Conquest.
    [43, stats.conquests >= 1],
    [44, stats.conquests >= 25],
    [45, stats.conquests >= 100],
    [46, stats.conquests >= 500],
    [47, stats.conquests >= 1000],
    // Countries.
    [48, stats.countryCount >= 1],
    [49, stats.countryCount >= 2],
    [50, stats.countryCount >= 5],
    [51, stats.countryCount >= 10],
    [52, stats.countryCount >= 25],
    [53, stats.countryCount >= 50],
    [54, stats.countryCount >= 100],
    [55, stats.countryCount >= 195],
  ];
  return defs.map(([onchainId, unlocked]) => {
    const c = badgeCopy(onchainId, locale);
    return { onchainId, name: c.name, description: c.description, unlocked };
  });
}

const ACHIEVEMENTS_CACHE_KEY = "miniklaim.unlockedBadges";

// Badge ids the player can mint via the `claimBadges` voucher. Mirrors
// computeEligibleBadgeIds in lib/onchain/badgeEligibility.ts, which omits the
// streak badges (5/7/14 day, ids 5-7) pending a day-streak query.
// Display groups follow the contiguous id ranges (territory 1-9, runs 10-15,
// single-run 16-19, distance 20-25, streaks 26-33, cities 34-42, conquest
// 43-47, countries 48-55).
const BADGE_GROUPS: { en: string; es: string; ids: number[] }[] = [
  { en: "Territory", es: "Territorio", ids: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { en: "Runs", es: "Corridas", ids: [10, 11, 12, 13, 14, 15] },
  { en: "Single run", es: "Una corrida", ids: [16, 17, 18, 19] },
  { en: "Distance", es: "Distancia", ids: [20, 21, 22, 23, 24, 25] },
  { en: "Streaks", es: "Rachas", ids: [26, 27, 28, 29, 30, 31, 32, 33] },
  { en: "Cities", es: "Ciudades", ids: [34, 35, 36, 37, 38, 39, 40, 41, 42] },
  { en: "Conquest", es: "Conquista", ids: [43, 44, 45, 46, 47] },
  {
    en: "Countries",
    es: "Paises",
    ids: [48, 49, 50, 51, 52, 53, 54, 55],
  },
];

function Achievements({
  stats,
  onchain,
}: {
  stats: UserStats;
  onchain: UserBadges | null;
}) {
  const { t, locale } = useLocale();
  const achievements = buildAchievements(stats, locale);
  const byId = new Map(achievements.map((a) => [a.onchainId, a]));
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement | null>(null);
  const heldSet = new Set(onchain?.heldIds ?? []);
  const contract = onchain?.contract ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlockedNow = achievements
      .filter((a) => a.unlocked)
      .map((a) => String(a.onchainId));
    let prev: string[] = [];
    try {
      const raw = window.localStorage.getItem(ACHIEVEMENTS_CACHE_KEY);
      if (raw) prev = JSON.parse(raw) as string[];
    } catch {
      // ignore corrupted cache
    }
    const fresh = unlockedNow.filter((k) => !prev.includes(k));
    if (fresh.length > 0) {
      const first = achievements.find((a) => String(a.onchainId) === fresh[0]);
      if (first) {
        queueMicrotask(() => setNewlyUnlocked(first));
        window.setTimeout(() => setNewlyUnlocked(null), 4000);
      }
    }
    try {
      window.localStorage.setItem(
        ACHIEVEMENTS_CACHE_KEY,
        JSON.stringify(unlockedNow),
      );
    } catch {
      // ignore quota
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedCount]);

  return (
    <>
      <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        <p className="mb-1 text-center text-xs text-zinc-500">
          {t("me.badges.header")} {unlockedCount} {t("me.badges.of")}{" "}
          {achievements.length}
        </p>
        {BADGE_GROUPS.map((group) => (
          <div key={group.en} className="mt-2 first:mt-1">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              {locale === "es" ? group.es : group.en}
            </p>
            {group.ids.map((id) => {
              const a = byId.get(id);
              if (!a) return null;
              const minted = heldSet.has(a.onchainId);
              return (
                <div
                  key={a.onchainId}
                  className={`flex items-center justify-between gap-3 ${a.unlocked ? "text-zinc-900" : "text-zinc-500"}`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`inline-block h-7 w-7 shrink-0 ${a.unlocked ? "" : "opacity-40 grayscale"}`}
                      dangerouslySetInnerHTML={{
                        __html: badgeSvg(a.onchainId, 28),
                      }}
                    />
                    <span className={a.unlocked ? "font-semibold" : ""}>
                      {a.name}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">
                      {a.description}
                    </span>
                    {minted && contract && (
                      <a
                        href={`https://celoscan.io/token/${contract}?a=${a.onchainId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] text-orange-700 underline hover:text-orange-800"
                        title="View on Celoscan"
                      >
                        on-chain
                      </a>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {newlyUnlocked && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-3 text-sm text-white shadow-2xl">
          <span className="text-orange-700">{t("me.badges.toast")}</span>{" "}
          <span className="font-semibold">{newlyUnlocked.name}</span>
        </div>
      )}
    </>
  );
}

function RunsList({
  runs,
}: {
  runs: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    hexesClaimed: number;
    distanceMeters: number;
    mintTxHash: string | null;
  }>;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="mb-2 text-center text-xs text-zinc-500">
        {t("me.runs.header")}
      </p>
      {runs.map((run) => {
        const start = new Date(run.startedAt);
        const dateLabel = start.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const duration = run.endedAt
          ? formatDuration(new Date(run.endedAt).getTime() - start.getTime())
          : t("me.runs.running");
        const distLabel =
          run.distanceMeters >= 1000
            ? `${(run.distanceMeters / 1000).toFixed(2)}km`
            : `${run.distanceMeters}m`;
        return (
          <div
            key={run.id}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="text-zinc-600">{dateLabel}</span>
            <span className="font-mono text-zinc-500">{duration}</span>
            <span className="font-mono text-zinc-500">{distLabel}</span>
            <span className="font-mono font-semibold text-zinc-900">
              {run.hexesClaimed}{" "}
              {run.hexesClaimed === 1 ? t("me.runs.block") : t("me.runs.blocks")}
            </span>
            {run.mintTxHash ? (
              <a
                href={`https://celoscan.io/tx/${run.mintTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-orange-700 underline hover:text-orange-800"
              >
                {t("me.runs.viewOnChain")}
              </a>
            ) : (
              <span className="w-4" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BalancesCard({
  balances,
}: {
  balances: {
    USDm: Balance | null;
    USDC: Balance | null;
    USDT: Balance | null;
  };
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="text-center text-xs text-zinc-500">
        {t("me.wallet.header")}
      </p>
      <p className="mb-1 text-center text-[10px] text-zinc-500">
        {t("me.wallet.subtitle")}
      </p>
      <BalanceRow symbol="USDm" balance={balances.USDm} />
      <BalanceRow symbol="USDC" balance={balances.USDC} />
      <BalanceRow symbol="USDT" balance={balances.USDT} />
    </div>
  );
}

function BalanceRow({
  symbol,
  balance,
}: {
  symbol: TokenSymbol;
  balance: Balance | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 font-mono text-xs">
      <span className="text-zinc-600">{symbol}</span>
      <span className="text-zinc-900">
        {balance ? formatAmount(balance.formatted) : "..."}
      </span>
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatAmount(formatted: string): string {
  const n = Number(formatted);
  if (!Number.isFinite(n)) return formatted;
  if (n === 0) return "0.00";
  if (n < 0.01) return "<0.01";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
