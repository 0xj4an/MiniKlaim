"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import es from "i18n-iso-countries/langs/es.json";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";

countries.registerLocale(en);
countries.registerLocale(es);
import { BadgeClaimPrompt } from "@/app/BadgeClaimPrompt";
import { LinkWallet } from "@/app/LinkWallet";
import { RewardsSection } from "@/app/me/RewardsSection";
import { badgeSvg } from "@/lib/onchain/badgeArt";
import {
  BADGE_GROUPS,
  evaluateBadges,
  type EvaluatedBadge,
} from "@/lib/onchain/badgeCatalog";
import { type Balance, useBalances } from "@/lib/wallet/useBalances";
import { type UseUser, useUser } from "@/lib/wallet/useUser";
import { useUserRuns } from "@/lib/wallet/useUserRuns";
import { type UserStats, useUserStats } from "@/lib/wallet/useUserStats";
import { useWallet } from "@/lib/wallet/useWallet";
import { type TokenSymbol } from "@/lib/tokens";
import { useGeoSummary } from "@/lib/wallet/useGeoSummary";

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
  const geoSummary = useGeoSummary(
    isConnected && !isWrongChain ? address : null,
  );
  const balances = useBalances(address, isConnected && !isWrongChain);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8 pb-24">
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

              <Achievements stats={stats} />
              <BadgeClaimPrompt
                address={address ?? null}
                enabled={isConnected && !isWrongChain}
              />
              <RewardsSection address={address ?? null} />
            </>
          )}

          {address && <TerritoryMap address={address} />}

          {recentRuns && recentRuns.length > 0 && (
            <RunsList runs={recentRuns} />
          )}

          {geoSummary && (geoSummary.byCountry.length > 0 || geoSummary.byCity.length > 0) && (
            <GeoSummarySection summary={geoSummary} />
          )}

          <LinkWallet address={address ?? null} />

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
    track("share_button_pressed", { surface: "profile" });
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
    const trimmed = input.trim();
    const isFirstTime = !user?.username;
    const result = await setUsername(trimmed);
    setIsSaving(false);
    if (result.ok) {
      if (isFirstTime) {
        track("username_picked", {
          length: trimmed.length,
          is_first_time: true,
        });
      } else {
        track("username_changed", { length: trimmed.length });
      }
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

const ACHIEVEMENTS_CACHE_KEY = "miniklaim.unlockedBadges";

function Achievements({ stats }: { stats: UserStats }) {
  const { t, locale } = useLocale();
  const achievements = evaluateBadges(stats, locale);
  const byId = new Map(achievements.map((a) => [a.onchainId, a]));
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const [newlyUnlocked, setNewlyUnlocked] = useState<EvaluatedBadge | null>(
    null,
  );

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
                  <span className="text-xs text-zinc-500">
                    {a.description}
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

function GeoSummarySection({ summary }: { summary: { byCountry: Array<{ country: string; count: number }>; byCity: Array<{ country: string; city: string; count: number }> } }) {
  const { t, locale } = useLocale();
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());

  const citiesMap = new Map<string, Array<{ city: string; count: number }>>();
  for (const item of summary.byCity) {
    if (!citiesMap.has(item.country)) {
      citiesMap.set(item.country, []);
    }
    citiesMap.get(item.country)!.push({ city: item.city, count: item.count });
  }

  const toggleCountry = (countryCode: string) => {
    const newSet = new Set(expandedCountries);
    if (newSet.has(countryCode)) {
      newSet.delete(countryCode);
    } else {
      newSet.add(countryCode);
    }
    setExpandedCountries(newSet);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="mb-1 text-center text-xs text-zinc-500">
        {t("me.geo.header")}
      </p>
      <div className="flex flex-col gap-2">
        {summary.byCountry.map((country) => {
          const cities = citiesMap.get(country.country) ?? [];
          const isExpanded = expandedCountries.has(country.country);
          return (
            <div key={country.country} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{getCountryFlag(country.country)}</span>
                  <span className="text-xs font-semibold text-zinc-900">
                    {getCountryNameSimple(country.country, locale)}
                  </span>
                  {cities.length > 0 && (
                    <button
                      onClick={() => toggleCountry(country.country)}
                      className="text-zinc-500 hover:text-zinc-700"
                      aria-label={isExpanded ? t("me.geo.hideCities") : t("me.geo.showCities")}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                </div>
                <span className="text-xs font-mono font-semibold text-zinc-900">
                  {country.count}
                </span>
              </div>
              {isExpanded && cities.length > 0 && (
                <div className="ml-6 flex flex-col gap-0.5">
                  {cities.map((city) => (
                    <div
                      key={city.city}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="text-zinc-600">{city.city}</span>
                      <span className="font-mono text-zinc-900">{city.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
    topCity: string | null;
    topCountry: string | null;
  }>;
}) {
  const { t, locale } = useLocale();
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
        
        const hasLocation = run.topCity || run.topCountry;
        const cityName = run.topCity || null;
        const countryName = run.topCountry ? getCountryNameSimple(run.topCountry, locale) : null;
        const flag = run.topCountry ? getCountryFlag(run.topCountry) : null;

        return (
          <div
            key={run.id}
            className="flex flex-col gap-0.5 border-b border-zinc-200 pb-2 last:border-0 last:pb-0"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-zinc-600">{dateLabel}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-zinc-500">{duration}</span>
                <span className="font-mono text-zinc-500">{distLabel}</span>
                <span className="font-mono font-semibold text-zinc-900">
                  {run.hexesClaimed}{" "}
                  {run.hexesClaimed === 1 ? t("me.runs.block") : t("me.runs.blocks")}
                </span>
              </div>
            </div>
            {hasLocation && (
              <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                {flag && <span className="text-sm">{flag}</span>}
                <span>
                  {cityName && countryName && `${cityName}, ${countryName}`}
                  {cityName && !countryName && cityName}
                  {!cityName && countryName && countryName}
                </span>
              </div>
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

function getCountryFlag(code: string): string {
  if (code.length === 3) {
    const iso2 = countries.alpha3ToAlpha2(code);
    if (iso2) {
      const codePoints = [...iso2].map(char => 127397 + char.charCodeAt(0));
      return String.fromCodePoint(...codePoints);
    }
  }
  return "🌍";
}

function getCountryNameSimple(code: string, locale: "en" | "es" = "en"): string {
  const name = countries.getName(code, locale, { select: "official" });
  return name || code;
}
