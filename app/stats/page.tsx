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
