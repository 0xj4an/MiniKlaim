"use client";

import Link from "next/link";
import { useFirstVisit } from "@/lib/useFirstVisit";
import { useGlobalStats } from "@/lib/useGlobalStats";
import { useActiveRun } from "@/lib/wallet/useActiveRun";
import { useUser } from "@/lib/wallet/useUser";
import { useWallet } from "@/lib/wallet/useWallet";

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
    switchToCelo,
  } = useWallet();

  const { user } = useUser(isConnected ? address : null);
  const { active: activeRun } = useActiveRun(
    isConnected && !isWrongChain ? address : null,
  );
  const globalStats = useGlobalStats();
  const { showOnboarding, dismiss } = useFirstVisit();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between px-6 py-12">
      {showOnboarding && <OnboardingModal onClose={dismiss} />}
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-5xl font-bold">MiniKlaim</h1>
          <p className="text-lg text-zinc-700">
            Run the city. The blocks you cross are yours.
          </p>
        </div>

        {globalStats && (
          <p className="text-xs text-zinc-400">
            <span className="font-semibold text-zinc-600">
              {globalStats.totalHexes}
            </span>{" "}
            blocks captured ·{" "}
            <span className="font-semibold text-zinc-600">
              {globalStats.totalPlayers}
            </span>{" "}
            {globalStats.totalPlayers === 1 ? "player" : "players"}
          </p>
        )}

        <PrimaryCTA
          isConnected={isConnected}
          isConnecting={isConnecting}
          isMiniPay={isMiniPay}
          isWrongChain={isWrongChain}
          isSwitchingChain={isSwitchingChain}
          chainId={chainId}
          username={user?.username ?? null}
          hasActiveRun={activeRun !== null}
          connect={connect}
          switchToCelo={switchToCelo}
        />
      </div>

      <nav className="flex gap-6 text-xs text-zinc-400">
        {isConnected && (
          <Link href="/me" className="underline hover:text-zinc-700">
            You
          </Link>
        )}
        <Link href="/community" className="underline hover:text-zinc-700">
          Community
        </Link>
        <Link href="/about" className="underline hover:text-zinc-700">
          Help
        </Link>
      </nav>
    </main>
  );
}

function OnboardingModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-6 flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-2xl font-bold">Welcome!</h2>
        <ol className="flex flex-col gap-3 text-sm text-zinc-700">
          <li className="flex gap-3">
            <span className="font-mono text-zinc-400">1.</span>
            <span>
              <span className="font-semibold text-zinc-900">Walk or run.</span>{" "}
              The blocks you cross become yours on the map.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-zinc-400">2.</span>
            <span>
              <span className="font-semibold text-zinc-900">Keep going.</span>{" "}
              The more you run, the more land you own.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-zinc-400">3.</span>
            <span>
              <span className="font-semibold text-zinc-900">
                Watch your back.
              </span>{" "}
              Other players can steal your blocks if they run through them.
            </span>
          </li>
        </ol>
        <button
          onClick={onClose}
          className="mt-2 rounded-full bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function PrimaryCTA({
  isConnected,
  isConnecting,
  isMiniPay,
  isWrongChain,
  isSwitchingChain,
  chainId,
  username,
  hasActiveRun,
  connect,
  switchToCelo,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  isMiniPay: boolean;
  isWrongChain: boolean;
  isSwitchingChain: boolean;
  chainId: number | null;
  username: string | null;
  hasActiveRun: boolean;
  connect: () => void;
  switchToCelo: () => void;
}) {
  if (isConnecting) {
    return <p className="text-sm text-zinc-500">Signing in...</p>;
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-2">
        {!isMiniPay ? (
          <button
            onClick={connect}
            className="rounded-full bg-zinc-900 px-8 py-4 text-lg font-semibold text-white hover:bg-zinc-800"
          >
            Sign in to play
          </button>
        ) : (
          <p className="text-sm text-zinc-700">Connecting to MiniPay...</p>
        )}
        <p className="text-xs text-zinc-400">
          You&apos;ll need a crypto wallet. We use it just to keep your
          progress.
        </p>
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-5 py-4">
        <p className="text-sm text-amber-900">
          Wrong network. You&apos;re on chain {chainId}, MiniKlaim runs on Celo.
        </p>
        <button
          onClick={switchToCelo}
          disabled={isSwitchingChain}
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {isSwitchingChain ? "Switching..." : "Switch to Celo"}
        </button>
      </div>
    );
  }

  // Connected and on Celo
  return (
    <div className="flex flex-col items-center gap-3">
      {username && (
        <p className="text-sm text-zinc-600">
          Hey <span className="font-semibold text-zinc-900">@{username}</span>
        </p>
      )}
      <Link
        href="/run"
        className={`rounded-full px-8 py-4 text-lg font-semibold text-white shadow-md ${
          hasActiveRun
            ? "bg-red-600 hover:bg-red-700"
            : "bg-orange-500 hover:bg-orange-600"
        }`}
      >
        {hasActiveRun ? "Keep running →" : "Start running"}
      </Link>
      {!username && (
        <Link
          href="/me"
          className="text-xs text-zinc-500 underline hover:text-zinc-700"
        >
          Pick your name on the You page
        </Link>
      )}
    </div>
  );
}
