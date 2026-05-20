"use client";

import Link from "next/link";
import { useState } from "react";
import { useGlobalStats } from "@/lib/useGlobalStats";
import { type Balance, useBalances } from "@/lib/wallet/useBalances";
import { type UseUser, useUser } from "@/lib/wallet/useUser";
import { type UserRun, useUserRuns } from "@/lib/wallet/useUserRuns";
import { useUserStats } from "@/lib/wallet/useUserStats";
import { useWallet } from "@/lib/wallet/useWallet";
import { type TokenSymbol } from "@/lib/tokens";

export default function HomePage() {
  const {
    address,
    isConnected,
    isConnecting,
    isMiniPay,
    isWrongChain,
    isSwitchingChain,
    chainId,
    connect,
    disconnect,
    switchToCelo,
  } = useWallet();

  const balances = useBalances(address, isConnected && !isWrongChain);
  const userInfo = useUser(isConnected ? address : null);
  const stats = useUserStats(isConnected && !isWrongChain ? address : null);
  const recentRuns = useUserRuns(
    isConnected && !isWrongChain ? address : null,
    3,
  );
  const globalStats = useGlobalStats();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">MiniKlaim</h1>
      <p className="text-lg text-zinc-600">Run it. Klaim it.</p>

      {globalStats && (
        <p className="text-xs text-zinc-400">
          <span className="font-semibold text-zinc-600">
            {globalStats.totalHexes}
          </span>{" "}
          hexes claimed worldwide ·{" "}
          <span className="font-semibold text-zinc-600">
            {globalStats.totalPlayers}
          </span>{" "}
          {globalStats.totalPlayers === 1 ? "player" : "players"}
        </p>
      )}

      {isConnecting && <p className="text-sm text-zinc-500">Connecting...</p>}

      {isConnected && address && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm text-zinc-700">Connected</p>
          <p className="font-mono text-xs text-zinc-400">
            {address.slice(0, 6)}...{address.slice(-4)}
          </p>
          <UsernameBlock userInfo={userInfo} />

          {stats && !isWrongChain && (
            <div className="mt-2 flex gap-3 text-xs text-zinc-600">
              <span>
                <span className="font-semibold text-zinc-900">
                  {stats.hexesOwned}
                </span>{" "}
                hexes owned
              </span>
              <span className="text-zinc-300">·</span>
              <span>
                <span className="font-semibold text-zinc-900">
                  {stats.totalRuns}
                </span>{" "}
                runs
              </span>
            </div>
          )}

          {isWrongChain && (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900">
                Wrong network. Currently on chain {chainId}, MiniKlaim runs on
                Celo (42220).
              </p>
              <button
                onClick={switchToCelo}
                disabled={isSwitchingChain}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isSwitchingChain ? "Switching..." : "Switch to Celo"}
              </button>
            </div>
          )}

          {!isWrongChain && <RecentRuns runs={recentRuns} />}

          {!isWrongChain && (
            <div className="mt-3 flex min-w-[200px] flex-col items-stretch gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-xs">
              <p className="mb-1 text-center text-[10px] tracking-wide text-zinc-500 uppercase">
                Balances
              </p>
              {balances.isLoading ? (
                <p className="text-center text-zinc-400">Loading...</p>
              ) : balances.isError ? (
                <p className="text-center text-red-600">
                  Failed to load balances
                </p>
              ) : (
                <>
                  <BalanceRow symbol="USDm" balance={balances.USDm} />
                  <BalanceRow symbol="USDC" balance={balances.USDC} />
                  <BalanceRow symbol="USDT" balance={balances.USDT} />
                </>
              )}
            </div>
          )}

          {!isWrongChain && (
            <Link
              href="/run"
              className="mt-3 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Start Run
            </Link>
          )}

          {!isMiniPay && (
            <button
              onClick={disconnect}
              className="mt-2 text-xs text-zinc-500 underline"
            >
              Disconnect
            </button>
          )}
        </div>
      )}

      {!isConnected && !isConnecting && (
        <div className="flex flex-col items-center gap-3">
          {!isMiniPay ? (
            <>
              <button
                onClick={connect}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Connect Wallet
              </button>
              <p className="text-xs text-zinc-400">
                Running outside MiniPay. Will use any injected wallet (MetaMask,
                Rabby, MiniPay extension, etc.)
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-700">Connecting to MiniPay...</p>
          )}
          <a
            href="https://play.google.com/store/apps/details?id=com.opera.minipay"
            className="text-xs text-blue-600 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get MiniPay
          </a>
        </div>
      )}
    </main>
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
    <div className="flex items-center justify-between gap-4 py-0.5 font-mono">
      <span className="text-zinc-600">{symbol}</span>
      <span className="text-zinc-900">
        {balance ? formatAmount(balance.formatted) : "..."}
      </span>
    </div>
  );
}

function UsernameBlock({ userInfo }: { userInfo: UseUser }) {
  const { user, isLoading, setUsername } = userInfo;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (isLoading) {
    return <p className="text-xs text-zinc-400">Loading runner name...</p>;
  }
  if (user?.username) {
    return (
      <p className="text-sm text-zinc-900">
        <span className="text-zinc-400">@</span>
        <span className="font-medium">{user.username}</span>
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
    } else {
      setError(result.error ?? "unknown error");
    }
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-1">
      <p className="text-xs text-zinc-500">Pick a runner name</p>
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="runner_name"
          maxLength={20}
          disabled={isSaving}
          className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-xs focus:border-zinc-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={onSave}
          disabled={isSaving || !input.trim()}
          className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400"
        >
          {isSaving ? "..." : "Save"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function RecentRuns({ runs }: { runs: UserRun[] | null }) {
  if (!runs || runs.length === 0) return null;
  return (
    <div className="mt-3 flex min-w-[200px] flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-xs">
      <p className="mb-1 text-center text-[10px] tracking-wide text-zinc-500 uppercase">
        Recent runs
      </p>
      {runs.map((run) => (
        <RunRow key={run.id} run={run} />
      ))}
    </div>
  );
}

function RunRow({ run }: { run: UserRun }) {
  const start = new Date(run.startedAt);
  const dateLabel = start.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const duration = run.endedAt
    ? formatDuration(new Date(run.endedAt).getTime() - start.getTime())
    : "active";
  const distLabel =
    run.distanceMeters >= 1000
      ? `${(run.distanceMeters / 1000).toFixed(2)}km`
      : `${run.distanceMeters}m`;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-600">{dateLabel}</span>
      <span className="font-mono text-zinc-500">{duration}</span>
      <span className="font-mono text-zinc-500">{distLabel}</span>
      <span className="font-mono text-zinc-900">{run.hexesClaimed} hex</span>
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
