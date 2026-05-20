"use client";

import Link from "next/link";
import { useUserRuns } from "@/lib/wallet/useUserRuns";
import { useWallet } from "@/lib/wallet/useWallet";

export default function RunsPage() {
  const { address, isConnected, isWrongChain } = useWallet();
  const runs = useUserRuns(isConnected && !isWrongChain ? address : null, 50);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">Your runs</h1>
        <span className="w-16" />
      </header>

      {!isConnected && (
        <p className="text-center text-sm text-zinc-500">
          Connect your wallet on{" "}
          <Link href="/" className="text-blue-600 underline">
            home
          </Link>{" "}
          to see your runs.
        </p>
      )}

      {isConnected && runs && runs.length === 0 && (
        <p className="text-center text-sm text-zinc-500">
          No runs yet.{" "}
          <Link href="/run" className="text-blue-600 underline">
            Start your first run
          </Link>
          .
        </p>
      )}

      {isConnected && runs && runs.length > 0 && (
        <div className="flex flex-col divide-y divide-zinc-200 rounded-md border border-zinc-200">
          {runs.map((run) => {
            const start = new Date(run.startedAt);
            const dateLabel = start.toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            const duration = run.endedAt
              ? formatDuration(
                  new Date(run.endedAt).getTime() - start.getTime(),
                )
              : "active";
            const distLabel =
              run.distanceMeters >= 1000
                ? `${(run.distanceMeters / 1000).toFixed(2)}km`
                : `${run.distanceMeters}m`;
            return (
              <div
                key={run.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="text-zinc-600">{dateLabel}</span>
                <div className="flex items-center gap-4 font-mono text-zinc-500">
                  <span>{duration}</span>
                  <span>{distLabel}</span>
                  <span className="font-semibold text-zinc-900">
                    {run.hexesClaimed} hex
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
