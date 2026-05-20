"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type Balance, useBalances } from "@/lib/wallet/useBalances";
import { type UseUser, useUser } from "@/lib/wallet/useUser";
import { useUserRuns } from "@/lib/wallet/useUserRuns";
import { type UserStats, useUserStats } from "@/lib/wallet/useUserStats";
import { useWallet } from "@/lib/wallet/useWallet";
import { type TokenSymbol } from "@/lib/tokens";
import { TerritoryMap } from "./TerritoryMap";

export default function MePage() {
  const { address, isConnected, isWrongChain, disconnect, isMiniPay } =
    useWallet();
  const userInfo = useUser(isConnected ? address : null);
  const stats = useUserStats(isConnected && !isWrongChain ? address : null);
  const recentRuns = useUserRuns(
    isConnected && !isWrongChain ? address : null,
    50,
  );
  const balances = useBalances(address, isConnected && !isWrongChain);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← Home
        </Link>
        <h1 className="text-xl font-bold">You</h1>
        <button
          onClick={() => window.location.reload()}
          aria-label="Refresh"
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
          Sign in on the{" "}
          <Link href="/" className="text-blue-600 underline">
            home page
          </Link>{" "}
          to see your stats.
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
                <BigStat label="blocks" value={stats.hexesOwned} />
                <BigStat label="runs" value={stats.totalRuns} />
                <BigStat
                  label={stats.streak === 1 ? "day streak" : "days streak"}
                  value={stats.streak}
                />
              </div>

              {(stats.bestRunHexes > 0 || stats.hexesOwned > 0) && (
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-zinc-500">
                  {stats.bestRunHexes > 0 && (
                    <span>
                      Best run:{" "}
                      <span className="font-semibold text-zinc-900">
                        {stats.bestRunHexes} blocks
                      </span>
                    </span>
                  )}
                  {stats.hexesOwned > 0 && (
                    <span>
                      You&apos;re{" "}
                      <span className="font-semibold text-zinc-900">
                        #{stats.rank}
                      </span>{" "}
                      worldwide
                    </span>
                  )}
                </div>
              )}

              <Achievements stats={stats} />
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
              Sign out
            </button>
          )}
        </>
      )}
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

function UsernameBlock({ userInfo }: { userInfo: UseUser }) {
  const { user, isLoading, setUsername } = userInfo;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) {
    return <p className="text-sm text-zinc-400">Loading...</p>;
  }
  if (user?.username && !isEditing) {
    return (
      <p className="text-2xl font-bold">
        <span className="text-zinc-400">@</span>
        <span>{user.username}</span>
        <button
          onClick={() => {
            setInput(user.username ?? "");
            setError(null);
            setIsEditing(true);
          }}
          className="ml-3 text-xs font-normal text-zinc-400 underline hover:text-zinc-600"
        >
          change name
        </button>
      </p>
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
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-zinc-700">
        {user?.username
          ? "Change your name"
          : "Pick a name. This is how people will see you."}
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="your name"
          maxLength={20}
          disabled={isSaving}
          className="w-44 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={onSave}
          disabled={isSaving || !input.trim()}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
        {isEditing && (
          <button
            onClick={() => {
              setIsEditing(false);
              setInput("");
              setError(null);
            }}
            disabled={isSaving}
            className="text-xs text-zinc-500 underline hover:text-zinc-700"
          >
            cancel
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

type Achievement = {
  key: string;
  name: string;
  desc: string;
  unlocked: boolean;
};

function buildAchievements(stats: UserStats): Achievement[] {
  return [
    {
      key: "first-steps",
      name: "First steps",
      desc: "Finish your first run",
      unlocked: stats.totalRuns >= 1,
    },
    {
      key: "block-hunter",
      name: "Five blocks",
      desc: "Own 5 blocks",
      unlocked: stats.hexesOwned >= 5,
    },
    {
      key: "mayor",
      name: "Mayor",
      desc: "Own 20 blocks",
      unlocked: stats.hexesOwned >= 20,
    },
    {
      key: "streak-3",
      name: "Three days",
      desc: "3 days in a row",
      unlocked: stats.streak >= 3,
    },
    {
      key: "streak-7",
      name: "One week",
      desc: "7 days in a row",
      unlocked: stats.streak >= 7,
    },
    {
      key: "big-run",
      name: "Big run",
      desc: "5 blocks in one run",
      unlocked: stats.bestRunHexes >= 5,
    },
  ];
}

const ACHIEVEMENTS_CACHE_KEY = "miniklaim.unlockedBadges";

function Achievements({ stats }: { stats: UserStats }) {
  const achievements = buildAchievements(stats);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlockedNow = achievements
      .filter((a) => a.unlocked)
      .map((a) => a.key);
    let prev: string[] = [];
    try {
      const raw = window.localStorage.getItem(ACHIEVEMENTS_CACHE_KEY);
      if (raw) prev = JSON.parse(raw) as string[];
    } catch {
      // ignore corrupted cache
    }
    const fresh = unlockedNow.filter((k) => !prev.includes(k));
    if (fresh.length > 0) {
      const first = achievements.find((a) => a.key === fresh[0]);
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
          Badges {unlockedCount} of {achievements.length}
        </p>
        {achievements.map((a) => (
          <div
            key={a.key}
            className={`flex items-center justify-between gap-3 ${a.unlocked ? "text-zinc-900" : "text-zinc-400"}`}
          >
            <span className={a.unlocked ? "font-semibold" : ""}>{a.name}</span>
            <span className="text-xs text-zinc-500">{a.desc}</span>
          </div>
        ))}
      </div>
      {newlyUnlocked && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-3 text-sm text-white shadow-2xl">
          <span className="text-orange-400">Badge unlocked:</span>{" "}
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
  }>;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="mb-2 text-center text-xs text-zinc-500">Your runs</p>
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
          : "running";
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
              {run.hexesClaimed} {run.hexesClaimed === 1 ? "block" : "blocks"}
            </span>
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
  return (
    <div className="flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <p className="mb-1 text-center text-xs text-zinc-500">Your money</p>
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
