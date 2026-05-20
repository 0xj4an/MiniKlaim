"use client";

import Link from "next/link";
import { type ActivityEntry, useActivity } from "@/lib/useActivity";
import { useGlobalStats } from "@/lib/useGlobalStats";
import { type LeaderboardEntry, useLeaderboard } from "@/lib/useLeaderboard";
import { useWallet } from "@/lib/wallet/useWallet";

export default function CommunityPage() {
  const { address, isConnected } = useWallet();
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
          ← Home
        </Link>
        <h1 className="text-xl font-bold">Community</h1>
        <span className="w-16" />
      </header>

      {globalStats && (
        <div className="flex justify-center gap-8 text-center">
          <BigStat label="blocks captured" value={globalStats.totalHexes} />
          <BigStat
            label={globalStats.totalPlayers === 1 ? "player" : "players"}
            value={globalStats.totalPlayers}
          />
        </div>
      )}

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
  if (!entries || entries.length === 0) return null;
  const me = myAddress?.toLowerCase() ?? null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="mb-1 text-center text-xs text-zinc-500">Top players</p>
      {entries.map((e, i) => {
        const fallback = `${e.address.slice(0, 6)}...${e.address.slice(-4)}`;
        const isMe = me !== null && e.address.toLowerCase() === me;
        return (
          <div
            key={e.address}
            className={`flex items-center justify-between gap-3 ${isMe ? "font-semibold text-zinc-900" : "text-zinc-700"}`}
          >
            <span className="w-8 text-zinc-400">#{i + 1}</span>
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
              {e.hexCount} {e.hexCount === 1 ? "block" : "blocks"}
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
  if (!entries || entries.length === 0) return null;
  const me = myAddress?.toLowerCase() ?? null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="mb-1 text-center text-xs text-zinc-500">Latest runs</p>
      {entries.map((e) => {
        const fallback = `${e.address.slice(0, 6)}...${e.address.slice(-4)}`;
        const isMe = me !== null && e.address.toLowerCase() === me;
        const when = relativeTime(new Date(e.endedAt).getTime());
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
              {e.hexesClaimed} {e.hexesClaimed === 1 ? "block" : "blocks"}
            </span>
            <span className="text-xs text-zinc-400">{when}</span>
          </div>
        );
      })}
    </div>
  );
}

function relativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
