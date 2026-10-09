"use client";

import countries from "i18n-iso-countries";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { type TranslationKey, useLocale } from "@/lib/i18n";
import { type ActivityEntry, useActivity } from "@/lib/useActivity";
import { useGlobalStats } from "@/lib/useGlobalStats";
import { type LeaderboardEntry, useLeaderboard } from "@/lib/useLeaderboard";
import { useWallet } from "@/lib/wallet/useWallet";
import { Footer } from "@/app/Footer";

const WorldMap = dynamic(() => import("./WorldMap").then((m) => m.WorldMap), {
  ssr: false,
});

export default function CommunityPage() {
  const { address, isConnected } = useWallet();
  const { t } = useLocale();
  const globalStats = useGlobalStats();
  const leaderboard = useLeaderboard(10);
  const activity = useActivity(10);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← {t("common.home")}
        </Link>
        <h1 className="text-xl font-bold">{t("community.title")}</h1>
        <span className="w-16" />
      </header>

      {globalStats && (
        <div className="flex justify-center gap-8 text-center">
          <BigStat
            label={t("community.stat.blocksCaptured")}
            value={globalStats.totalHexes}
          />
          <BigStat
            label={
              globalStats.totalPlayers === 1
                ? t("community.stat.player")
                : t("community.stat.players")
            }
            value={globalStats.totalPlayers}
          />
        </div>
      )}

      <WorldMap myAddress={isConnected ? address : null} />

      <Leaderboard
        entries={leaderboard}
        myAddress={isConnected ? address : null}
      />

      <ActivityFeed
        entries={activity}
        myAddress={isConnected ? address : null}
      />
      <Footer />
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

function Leaderboard({
  entries,
  myAddress,
}: {
  entries: LeaderboardEntry[] | null;
  myAddress: string | null;
}) {
  const { t } = useLocale();
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);

  if (!entries || entries.length === 0) return null;
  const me = myAddress?.toLowerCase() ?? null;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="mb-1 text-center text-xs font-semibold text-zinc-500">
        {t("community.leaderboard.header")}
      </p>
      {entries.map((e, i) => {
        const fallback = t("common.anonymous");
        const isMe = me !== null && e.address.toLowerCase() === me;
        const isExpanded = expandedPlayer === e.address;
        const profileUrl = e.username ? `/p/${e.username}` : null;

        return (
          <div key={e.address} className="flex flex-col gap-1">
            <div
              className={`flex items-center gap-2 ${isMe ? "font-semibold text-zinc-900" : "text-zinc-700"}`}
            >
              <span className="w-6 text-xs text-zinc-500">#{i + 1}</span>

              {/* Player name - clickable */}
              <button
                onClick={() => setExpandedPlayer(isExpanded ? null : e.address)}
                className="flex flex-1 items-center gap-1.5 text-left hover:text-blue-600"
              >
                {e.username ? `@${e.username}` : fallback}
              </button>

              {/* Countries flags */}
              {e.countries.length > 0 && (
                <div className="flex gap-0.5">
                  {e.countries.map((country) => (
                    <span key={country} className="text-sm">
                      {getCountryFlag(country)}
                    </span>
                  ))}
                </div>
              )}

              {/* Badges count */}
              {e.badges.length > 0 && (
                <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  🏅 {e.badges.length}
                </span>
              )}

              {/* Hexes count */}
              <span className="font-mono text-xs font-semibold">
                {e.hexCount}
              </span>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="ml-8 flex flex-col gap-1.5 rounded-md bg-white p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Blocks:</span>
                  <span className="font-semibold">{e.hexCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Runs:</span>
                  <span className="font-semibold">{e.runCount}</span>
                </div>
                {e.countries.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-zinc-500">Countries:</span>
                    <div className="flex flex-wrap gap-1">
                      {e.countries.map((country) => (
                        <span
                          key={country}
                          className="rounded bg-zinc-100 px-1.5 py-0.5"
                        >
                          {getCountryFlag(country)} {country}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {e.badges.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-zinc-500">Badges:</span>
                    <div className="flex flex-wrap gap-1">
                      {e.badges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700"
                        >
                          {getBadgeEmoji(badge)} {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {profileUrl && (
                  <Link
                    href={profileUrl}
                    className="mt-1 text-center text-blue-600 hover:underline"
                  >
                    View full profile →
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Helper: Get country flag emoji from ISO3 code
function getCountryFlag(iso3: string): string {
  const iso2 = countries.alpha3ToAlpha2(iso3);
  if (!iso2) return "🏳️";
  const codePoints = [...iso2].map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Helper: Get badge emoji
function getBadgeEmoji(badge: string): string {
  const emojis: Record<string, string> = {
    first: "🥇",
    explorer: "🗺️",
    streak: "🔥",
    country: "🌍",
    distance: "🏃",
    collector: "📦",
  };
  return emojis[badge.toLowerCase()] || "🏅";
}

function ActivityFeed({
  entries,
  myAddress,
}: {
  entries: ActivityEntry[] | null;
  myAddress: string | null;
}) {
  const { t } = useLocale();
  if (!entries || entries.length === 0) return null;
  const me = myAddress?.toLowerCase() ?? null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="mb-1 text-center text-xs text-zinc-500">
        {t("community.activity.header")}
      </p>
      {entries.map((e) => {
        const fallback = t("common.anonymous");
        const isMe = me !== null && e.address.toLowerCase() === me;
        const when = relativeTime(new Date(e.endedAt).getTime(), t);
        return (
          <div
            key={e.id}
            className={`flex items-center gap-2 ${isMe ? "font-medium text-zinc-900" : "text-zinc-700"}`}
          >
            <span className="flex-1 truncate">
              {e.username ? (
                <Link href={`/p/${e.username}`} className="hover:underline">
                  @{e.username}
                </Link>
              ) : (
                fallback
              )}
            </span>
            {e.country && (
              <span className="flex items-center gap-1 text-xs text-zinc-600">
                <span className="text-base">{getCountryFlag(e.country)}</span>
                {e.city && <span>{e.city}</span>}
              </span>
            )}
            <span className="font-mono text-xs text-zinc-500">
              {e.hexesClaimed}{" "}
              {e.hexesClaimed === 1
                ? t("community.block")
                : t("community.blocks")}
            </span>
            <span className="text-xs text-zinc-500">{when}</span>
          </div>
        );
      })}
    </div>
  );
}

function relativeTime(
  timestamp: number,
  t: (key: TranslationKey) => string,
): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const prefix = t("time.agoPrefix");
  const suffix = t("time.agoSuffix");
  let value: string;
  if (diffSec < 60) {
    value = `${diffSec}${t("time.unit.seconds")}`;
  } else if (diffSec < 3600) {
    value = `${Math.floor(diffSec / 60)}${t("time.unit.minutes")}`;
  } else if (diffSec < 86400) {
    value = `${Math.floor(diffSec / 3600)}${t("time.unit.hours")}`;
  } else {
    value = `${Math.floor(diffSec / 86400)}${t("time.unit.days")}`;
  }
  return `${prefix}${value}${suffix}`;
}
