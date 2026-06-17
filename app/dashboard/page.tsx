import type { Metadata } from "next";
import {
  type ChainMetrics,
  readAllMetrics,
} from "@/lib/onchain/metrics";

// Independent web-only dashboard of on-chain contract metrics, per chain and
// aggregated. Not part of the in-app (MiniPay) flow; desktop-first. Re-reads
// the chains every 60s.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "MiniKlaim - On-chain dashboard",
  description: "Live on-chain stats across every chain MiniKlaim runs on.",
};

export default async function DashboardPage() {
  const { chains, totals } = await readAllMetrics();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
          MiniKlaim on-chain dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Live contract metrics across every chain. Auto-refreshes each minute.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          All chains combined
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Hexes captured" value={totals.captures} />
          <Stat label="Claim-run txs" value={totals.claimRuns} />
          <Stat label="Hex players" value={totals.hexPlayers} />
          <Stat label="Badges minted" value={totals.badgesMinted} />
          <Stat label="Badge claim txs" value={totals.badgeClaimTxns} />
          <Stat label="Badge holders" value={totals.badgeHolders} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Per chain
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {chains.map((c) => (
            <ChainCard key={c.key} c={c} />
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

function ChainCard({ c }: { c: ChainMetrics }) {
  const configured = c.hexes !== null || c.badges !== null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-zinc-900">{c.label}</h3>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
          chain {c.chainId}
        </span>
      </div>

      {!configured ? (
        <p className="text-sm text-zinc-400">Not deployed on this chain yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Mini label="Hexes" value={c.hexes?.captures ?? 0} />
          <Mini label="Claim txs" value={c.hexes?.claimRuns ?? 0} />
          <Mini label="Players" value={c.hexes?.players ?? 0} />
          <Mini label="Badges" value={c.badges?.minted ?? 0} />
          <Mini label="Claim txs" value={c.badges?.claimTxns ?? 0} />
          <Mini label="Holders" value={c.badges?.holders ?? 0} />
        </div>
      )}

      <div className="mt-5 space-y-1 text-xs text-zinc-400">
        {c.hexesAddress && (
          <ContractLink
            label="Hexes"
            address={c.hexesAddress}
            explorerBase={c.explorerBase}
          />
        )}
        {c.badgesAddress && (
          <ContractLink
            label="Badges"
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
