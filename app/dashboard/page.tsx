import type { Metadata } from "next";
import {
  type ChainMetrics,
  readAllMetrics,
} from "@/lib/onchain/metrics";
import { serverT } from "@/lib/i18nServer";
import type { TranslationKey } from "@/lib/i18nDict";

// Independent web-only dashboard of on-chain contract metrics, per chain and
// aggregated. Not part of the in-app (MiniPay) flow; desktop-first. Re-reads
// the chains every 60s. Localized so partners opening it in either language
// see a polished view.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await serverT();
  return {
    title: `MiniKlaim - ${t("dashboard.title")}`,
    description: t("dashboard.metadata.desc"),
  };
}

export default async function DashboardPage() {
  const [{ chains, totals }, { t }] = await Promise.all([
    readAllMetrics(),
    serverT(),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
          {t("dashboard.title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{t("dashboard.subtitle")}</p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {t("dashboard.section.all")}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label={t("dashboard.stat.hexesCaptured")}
            value={totals.captures}
          />
          <Stat
            label={t("dashboard.stat.claimRunTxs")}
            value={totals.claimRuns}
          />
          <Stat
            label={t("dashboard.stat.hexPlayers")}
            value={totals.hexPlayers}
          />
          <Stat
            label={t("dashboard.stat.badgesMinted")}
            value={totals.badgesMinted}
          />
          <Stat
            label={t("dashboard.stat.badgeClaimTxs")}
            value={totals.badgeClaimTxns}
          />
          <Stat
            label={t("dashboard.stat.badgeHolders")}
            value={totals.badgeHolders}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {t("dashboard.section.perChain")}
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {chains.map((c) => (
            <ChainCard key={c.key} c={c} t={t} />
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="text-2xl font-bold text-zinc-900">
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function ChainCard({
  c,
  t,
}: {
  c: ChainMetrics;
  t: (key: TranslationKey) => string;
}) {
  const configured = c.hexes !== null || c.badges !== null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-900">{c.label}</h3>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
          {t("dashboard.chain.prefix")} {c.chainId}
        </span>
      </div>

      {!configured ? (
        <p className="text-sm text-zinc-400">
          {t("dashboard.chain.notDeployed")}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Mini label={t("dashboard.mini.hexes")} value={c.hexes?.captures ?? 0} />
          <Mini
            label={t("dashboard.mini.hexClaimTxs")}
            value={c.hexes?.claimRuns ?? 0}
          />
          <Mini
            label={t("dashboard.mini.players")}
            value={c.hexes?.players ?? 0}
          />
          <Mini
            label={t("dashboard.mini.badges")}
            value={c.badges?.minted ?? 0}
          />
          <Mini
            label={t("dashboard.mini.badgeClaimTxs")}
            value={c.badges?.claimTxns ?? 0}
          />
          <Mini
            label={t("dashboard.mini.holders")}
            value={c.badges?.holders ?? 0}
          />
        </div>
      )}

      <div className="mt-5 space-y-1 text-xs text-zinc-400">
        {c.hexesAddress && (
          <ContractLink
            label={t("dashboard.contract.hexes")}
            address={c.hexesAddress}
            explorerBase={c.explorerBase}
          />
        )}
        {c.badgesAddress && (
          <ContractLink
            label={t("dashboard.contract.badges")}
            address={c.badgesAddress}
            explorerBase={c.explorerBase}
          />
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2">
      <div className="text-lg font-semibold text-zinc-900">
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}

function ContractLink({
  label,
  address,
  explorerBase,
}: {
  label: string;
  address: string;
  explorerBase: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-zinc-500">{label}</span>
      <a
        href={`${explorerBase}/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-mono text-orange-700 underline hover:text-orange-800"
      >
        {address}
      </a>
    </div>
  );
}
