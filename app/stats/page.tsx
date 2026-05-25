"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";

const log = createLogger("page:stats");

type Analytics = {
  totalPlayers: number;
  totalBlocks: number;
  runsLifetime: number;
  runs24h: number;
  runs7d: number;
  activePlayers7d: number;
  totalDistanceMeters: number;
  hexesOnchain: number;
  captureTxs: number;
  onchainHolders: number;
  hexesContract: string | null;
  badgesContract: string | null;
  chain: string;
  chainId: number;
};

export default function StatsPage() {
  const { t } = useLocale();
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stats/analytics");
        const json = (await res.json()) as Analytics;
        if (!cancelled) setData(json);
      } catch (e) {
        log.error("fetch failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← {t("common.home")}
        </Link>
        <h1 className="text-xl font-bold">{t("stats.title")}</h1>
        <span className="w-16" />
      </header>

      <p className="text-center text-xs text-zinc-500">
        {t("stats.subtitle")}
      </p>

      {!data && (
        <p className="text-center text-sm text-zinc-500">
          {t("common.loading")}
        </p>
      )}

      {data && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-xs tracking-wide text-zinc-500 uppercase">
              {t("stats.section.lifetime")}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label={t("stats.card.players")}
                value={data.totalPlayers}
              />
              <StatCard
                label={t("stats.card.blocksOwned")}
                value={data.totalBlocks}
              />
              <StatCard
                label={t("stats.card.finishedRuns")}
                value={data.runsLifetime}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs tracking-wide text-zinc-500 uppercase">
              {t("stats.section.7d")}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={t("stats.card.runs")} value={data.runs7d} />
              <StatCard
                label={t("stats.card.activePlayers")}
                value={data.activePlayers7d}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs tracking-wide text-zinc-500 uppercase">
              {t("stats.section.24h")}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={t("stats.card.runs")} value={data.runs24h} />
              <StatCard
                label={t("stats.card.kmTraveled")}
                value={
                  data.totalDistanceMeters >= 1000
                    ? Math.round(data.totalDistanceMeters / 1000)
                    : data.totalDistanceMeters
                }
                suffix={data.totalDistanceMeters >= 1000 ? " km" : " m"}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs tracking-wide text-zinc-500 uppercase">
              {t("stats.section.onchain")}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label={t("stats.card.hexesMinted")}
                value={data.hexesOnchain}
              />
              <StatCard
                label={t("stats.card.captureTxs")}
                value={data.captureTxs}
              />
              <StatCard
                label={t("stats.card.onchainHolders")}
                value={data.onchainHolders}
              />
            </div>
            <div className="mt-2 flex flex-col gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs">
              <p className="text-center text-zinc-500">
                {t("stats.contracts.title")}{" "}
                <span className="font-mono">{t("stats.contracts.chain")}</span>
              </p>
              <ContractRow
                label="MiniKlaimHexes (ERC-721)"
                address={data.hexesContract}
              />
              <ContractRow
                label="MiniKlaimBadges (ERC-1155)"
                address={data.badgesContract}
              />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center">
      <span className="text-3xl font-bold text-zinc-900">
        {value.toLocaleString()}
        {suffix && <span className="text-base">{suffix}</span>}
      </span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

function ContractRow({
  label,
  address,
}: {
  label: string;
  address: string | null;
}) {
  if (!address) {
    return (
      <div className="flex items-center justify-between gap-2 py-0.5">
        <span className="text-zinc-700">{label}</span>
        <span className="text-zinc-400">not deployed</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-zinc-700">{label}</span>
      <a
        href={`https://celoscan.io/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-[11px] text-orange-700 underline hover:text-orange-800"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </a>
    </div>
  );
}
