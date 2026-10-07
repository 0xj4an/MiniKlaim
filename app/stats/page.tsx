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
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-3 py-4 pb-24 sm:px-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm"
            >
              ← {t("common.home")}
            </Link>
            <div className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white"></span>
              LIVE
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-1 pt-2">
            <h1 className="text-2xl font-bold text-zinc-900">
              {t("stats.title")}
            </h1>
            <p className="text-center text-xs text-zinc-600">
              {t("stats.subtitle")}
            </p>
          </div>
        </header>

        {!data && (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-blue-600"></div>
            <p className="text-xs font-medium text-zinc-500">
              {t("common.loading")}
            </p>
          </div>
        )}

      {data && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-base">🏆</span>
              {t("stats.section.lifetime")}
            </h2>
            <div className="grid w-full grid-cols-3 gap-2">
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
            <div className="grid w-full grid-cols-2 gap-2">
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

          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-base">👥</span>
              {t("stats.section.active")}
            </h2>
            <div className="grid w-full grid-cols-3 gap-2">
              <StatCard label={t("stats.card.dau")} value={data.dau} />
              <StatCard label={t("stats.card.wau")} value={data.wau} />
              <StatCard label={t("stats.card.mau")} value={data.mau} />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-base">📈</span>
              {t("stats.section.retention")}
            </h2>
            <div className="grid w-full grid-cols-3 gap-2">
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

          <section className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-base">⛓️</span>
              {t("stats.section.onchain")}
            </h2>
            <div className="grid w-full grid-cols-2 gap-2">
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
            <div className="grid w-full grid-cols-2 gap-2">
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
            <section className="flex flex-col gap-2">
              <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-700">
                <span className="text-base">🌍</span>
                {t("stats.section.countries")}
              </h2>
              <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                {data.topCountries.slice(0, 5).map((country, idx) => (
                  <div
                    key={country.country}
                    className="flex items-center justify-between rounded-lg border border-zinc-100 bg-white p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600">
                        {idx + 1}
                      </span>
                      <span className="text-lg">{getFlag(country.country)}</span>
                      <span className="text-xs font-semibold text-zinc-900">
                        {getCountryName(country.country)}
                      </span>
                    </div>
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-600">
                      {country.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-zinc-700">
              <span className="text-base">📄</span>
              {t("stats.section.contracts")}
            </h3>
            <div className="flex flex-col gap-2 text-[10px]">
              <div className="flex justify-between gap-2">
                <span className="text-zinc-500">{t("stats.card.hexesContract")}:</span>
                <a
                  href={`https://celoscan.io/address/${data.hexesContract}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600"
                >
                  {data.hexesContract.slice(0, 6)}...{data.hexesContract.slice(-4)}
                </a>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-500">{t("stats.card.badgesContract")}:</span>
                <a
                  href={`https://celoscan.io/address/${data.badgesContract}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600"
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
    <div className="rounded-lg border border-zinc-200 bg-white p-3 text-center shadow-sm">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xl font-bold tabular-nums text-blue-600">
          {value.toLocaleString()}
          {suffix && <span className="text-sm">{suffix}</span>}
        </span>
        <span className="break-words text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{label}</span>
        {subtitle && (
          <span className="break-words text-[9px] font-medium text-zinc-400">{subtitle}</span>
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

