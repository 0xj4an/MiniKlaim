"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { type TranslationKey, useLocale } from "@/lib/i18n";
import { type ActivityEntry, useActivity } from "@/lib/useActivity";
import { useGlobalStats } from "@/lib/useGlobalStats";
import { type LeaderboardEntry, useLeaderboard } from "@/lib/useLeaderboard";
import { useWallet } from "@/lib/wallet/useWallet";

const WorldMap = dynamic(
  () => import("./WorldMap").then((m) => m.WorldMap),
  { ssr: false },
);

export default function CommunityPage() {
  const { address, isConnected } = useWallet();
  const { t } = useLocale();
  const globalStats = useGlobalStats();
  const leaderboard = useLeaderboard(10);
  const activity = useActivity(10);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8">
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
  if (!entries || entries.length === 0) return null;
  const me = myAddress?.toLowerCase() ?? null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="mb-1 text-center text-xs text-zinc-500">
        {t("community.leaderboard.header")}
      </p>
      {entries.map((e, i) => {
        const fallback = `${e.address.slice(0, 6)}...${e.address.slice(-4)}`;
        const isMe = me !== null && e.address.toLowerCase() === me;
        return (
          <div
            key={e.address}
            className={`flex items-center justify-between gap-3 ${isMe ? "font-semibold text-zinc-900" : "text-zinc-700"}`}
          >
            <span className="w-8 text-zinc-500">#{i + 1}</span>
            <span className="flex-1 truncate">
              {e.username ? (
                <Link
                  href={`/p/${e.username}`}
                  className="hover:underline"
                >
                  @{e.username}
                </Link>
              ) : (
                fallback
              )}
            </span>
            <span className="font-mono">
              {e.hexCount}{" "}
              {e.hexCount === 1 ? t("community.block") : t("community.blocks")}
            </span>
          </div>
        );
      })}
    </div>
  );
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
        const fallback = `${e.address.slice(0, 6)}...${e.address.slice(-4)}`;
        const isMe = me !== null && e.address.toLowerCase() === me;
        const when = relativeTime(new Date(e.endedAt).getTime(), t);
        return (
          <div
            key={e.id}
            className={`flex items-center justify-between gap-2 ${isMe ? "font-medium text-zinc-900" : "text-zinc-700"}`}
          >
            <span className="flex-1 truncate">
              {e.username ? (
                <Link
                  href={`/p/${e.username}`}
                  className="hover:underline"
                >
                  @{e.username}
                </Link>
              ) : (
                fallback
              )}
            </span>
            <span className="font-mono text-zinc-500">
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
