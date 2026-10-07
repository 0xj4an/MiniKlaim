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
  dau: number;
  wau: number;
  mau: number;
  hexesOnchain: number;
  onchainHolders: number;
  captureTxs: number;
  onchainTxs24h: number;
  onchainTxs7d: number;
  retention: {
    d1: number;
    d7: number;
    d30: number;
  };
  topCountries: Array<{
    country: string;
    count: number;
  }>;
  hexesContract: string;
  badgesContract: string;
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
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 pb-24 sm:px-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-900/5 transition hover:bg-zinc-50"
            >
              ← {t("common.home")}
            </Link>
            <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
              </span>
              LIVE
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-2 pt-4">
            <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-black text-transparent">
              {t("stats.title")}
            </h1>
            <p className="text-center text-sm text-zinc-600">
              {t("stats.subtitle")}
            </p>
          </div>
        </header>

        {!data && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-blue-600"></div>
            <p className="text-sm font-medium text-zinc-500">
              {t("common.loading")}
            </p>
          </div>
        )}

      {data && (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-xl">🏆</span>
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
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={t("stats.card.kmTraveled")}
                value={Math.round(data.totalDistanceMeters / 1000)}
                suffix=" km"
              />
              <StatCard
                label={t("stats.card.captureTxs")}
                value={data.captureTxs}
              />
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-xl">👥</span>
              {t("stats.section.active")}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label={t("stats.card.dau")} value={data.dau} />
              <StatCard label={t("stats.card.wau")} value={data.wau} />
              <StatCard label={t("stats.card.mau")} value={data.mau} />
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-xl">📈</span>
              {t("stats.section.retention")}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label={t("stats.card.d1")}
                value={Math.round(data.retention.d1 * 100)}
                suffix="%"
              />
              <StatCard
                label={t("stats.card.d7")}
                value={Math.round(data.retention.d7 * 100)}
                suffix="%"
              />
              <StatCard
                label={t("stats.card.d30")}
                value={Math.round(data.retention.d30 * 100)}
                suffix="%"
              />
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-xl">⛓️</span>
              {t("stats.section.onchain")}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={t("stats.card.hexesMinted")}
                value={data.hexesOnchain}
                subtitle={`${Math.round((data.hexesOnchain / data.totalBlocks) * 100)}% ${t("stats.card.ofTotal")}`}
              />
              <StatCard
                label={t("stats.card.holders")}
                value={data.onchainHolders}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={t("stats.card.txs24h")}
                value={data.onchainTxs24h}
              />
              <StatCard
                label={t("stats.card.txs7d")}
                value={data.onchainTxs7d}
              />
            </div>
          </section>

          {data.topCountries.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-700">
                <span className="text-xl">🌍</span>
                {t("stats.section.countries")}
              </h2>
              <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                {data.topCountries.slice(0, 5).map((country, idx) => (
                  <div
                    key={country.country}
                    className="group flex items-center justify-between rounded-xl border border-zinc-100 bg-gradient-to-r from-zinc-50 to-white p-3 transition hover:border-zinc-200 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-purple-100 text-xs font-bold text-blue-600">
                        {idx + 1}
                      </span>
                      <span className="text-2xl">{getFlag(country.country)}</span>
                      <span className="text-sm font-semibold text-zinc-900">
                        {getCountryName(country.country)}
                      </span>
                    </div>
                    <span className="rounded-full bg-gradient-to-br from-blue-100 to-purple-100 px-3 py-1 text-sm font-bold text-blue-600">
                      {country.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-xl">📄</span>
              {t("stats.section.contracts")}
            </h3>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">{t("stats.card.hexesContract")}:</span>
                <a
                  href={`https://celoscan.io/address/${data.hexesContract}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 hover:underline"
                >
                  {data.hexesContract.slice(0, 6)}...{data.hexesContract.slice(-4)}
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{t("stats.card.badgesContract")}:</span>
                <a
                  href={`https://celoscan.io/address/${data.badgesContract}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 hover:underline"
                >
                  {data.badgesContract.slice(0, 6)}...{data.badgesContract.slice(-4)}
                </a>
              </div>
            </div>
          </section>
        </>
      )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  suffix,
  subtitle,
}: {
  label: string;
  value: number;
  suffix?: string;
  subtitle?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm transition-all hover:scale-105 hover:shadow-md">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-purple-50/50 opacity-0 transition-opacity group-hover:opacity-100"></div>
      <div className="relative flex flex-col items-center gap-2">
        <span className="bg-gradient-to-br from-blue-600 to-purple-600 bg-clip-text text-4xl font-black tabular-nums text-transparent">
          {value.toLocaleString()}
          {suffix && <span className="text-xl">{suffix}</span>}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{label}</span>
        {subtitle && (
          <span className="text-[10px] font-medium text-zinc-400">{subtitle}</span>
        )}
      </div>
    </div>
  );
}

const COUNTRY_FLAGS: Record<string, string> = {
  COL: "🇨🇴",
  MEX: "🇲🇽",
  SWE: "🇸🇪",
  NGA: "🇳🇬",
  TUR: "🇹🇷",
  KEN: "🇰🇪",
  ZAF: "🇿🇦",
  BOL: "🇧🇴",
  GHA: "🇬🇭",
  IDN: "🇮🇩",
  USA: "🇺🇸",
  CAN: "🇨🇦",
  BRA: "🇧🇷",
  ARG: "🇦🇷",
  CHL: "🇨🇱",
  PER: "🇵🇪",
  VEN: "🇻🇪",
  ECU: "🇪🇨",
  URY: "🇺🇾",
  PRY: "🇵🇾",
};

const COUNTRY_NAMES: Record<string, string> = {
  COL: "Colombia",
  MEX: "México",
  SWE: "Sweden",
  NGA: "Nigeria",
  TUR: "Turkey",
  KEN: "Kenya",
  ZAF: "South Africa",
  BOL: "Bolivia",
  GHA: "Ghana",
  IDN: "Indonesia",
  USA: "United States",
  CAN: "Canada",
  BRA: "Brazil",
  ARG: "Argentina",
  CHL: "Chile",
  PER: "Peru",
  VEN: "Venezuela",
  ECU: "Ecuador",
  URY: "Uruguay",
  PRY: "Paraguay",
};

function getFlag(code: string): string {
  return COUNTRY_FLAGS[code] ?? "🌍";
}

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

