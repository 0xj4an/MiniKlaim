"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { useClaimRun } from "@/lib/wallet/useClaimRun";
import { usePendingClaim } from "@/lib/wallet/usePendingClaim";

const log = createLogger("ui:pendingClaim");

/**
 * Recovery surface for runs that finished server-side but never got minted
 * on-chain, typically because signal died between Finish and the mint tx.
 * The server is the source of truth via `hexes.mint_tx_hash`, and the
 * voucher endpoint is idempotent per run, so retries here are safe.
 *
 * Shows one run at a time (most recent first). After a successful mint the
 * hook refetches and the next pending run pops. "Later" dismisses only for
 * this session so a refresh brings it back.
 */
export function PendingClaimPrompt({
  address,
  enabled,
}: {
  address: Address | null;
  enabled: boolean;
}) {
  const { t } = useLocale();
  const { pending, refresh } = usePendingClaim(address, enabled);
  const { claim } = useClaimRun(address, enabled);
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const next = pending.find((r) => !dismissed.has(r.id));
  if (!next || !enabled || !address) return null;

  const distLabel =
    next.distanceMeters >= 1000
      ? `${(next.distanceMeters / 1000).toFixed(2)} km`
      : `${next.distanceMeters} m`;

  const runClaim = async () => {
    setState("pending");
    try {
      const outcome = await claim(next.id);
      log.info("pending claim outcome", { id: next.id, outcome });
      if (outcome === "failed") {
        setState("error");
        return;
      }
      if (outcome === "no-hexes") {
        setDismissed((s) => new Set(s).add(next.id));
      }
      refresh();
      setState("idle");
    } catch (e) {
      log.error("pending claim threw", {
        message: e instanceof Error ? e.message : String(e),
      });
      setState("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <p className="text-center text-base font-bold text-zinc-900">
          {t("pendingClaim.title")}
        </p>
        <p className="mt-2 text-center text-sm text-zinc-500">
          {t("pendingClaim.body")}
        </p>
        <div className="mt-4 flex justify-center gap-8 text-center">
          <div>
            <div className="font-mono text-xl font-bold text-zinc-900">
              {next.hexesClaimed}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("pendingClaim.blocks")}
            </div>
          </div>
          <div>
            <div className="font-mono text-xl font-bold text-zinc-900">
              {distLabel}
            </div>
            <div className="text-[10px] tracking-wide text-zinc-500 uppercase">
              {t("pendingClaim.distance")}
            </div>
          </div>
        </div>
        {state === "error" && (
          <p className="mt-3 text-center text-xs text-red-600">
            {t("pendingClaim.error")}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={runClaim}
            disabled={state === "pending"}
            className="w-full rounded-full bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {state === "pending"
              ? t("pendingClaim.pending")
              : t("pendingClaim.cta")}
          </button>
          <button
            onClick={() =>
              setDismissed((s) => new Set(s).add(next.id))
            }
            disabled={state === "pending"}
            className="w-full rounded-full px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-60"
          >
            {t("pendingClaim.later")}
          </button>
        </div>
      </div>
    </div>
  );
}
