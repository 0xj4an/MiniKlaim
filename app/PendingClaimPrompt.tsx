"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { isRunClaiming } from "@/lib/wallet/claimInFlight";
import { useClaimRun } from "@/lib/wallet/useClaimRun";
import { usePendingClaim } from "@/lib/wallet/usePendingClaim";

const log = createLogger("ui:pendingClaim");

/**
 * Recovery surface for runs that finished server-side but never got minted
 * on-chain, typically because signal died between Finish and the mint tx.
 * The server is the source of truth via `hexes.mint_tx_hash`, and the
 * voucher endpoint is idempotent per run, so retries here are safe.
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
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    // Load dismissed runs from localStorage
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("dismissed_pending_claims");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Checked at render time, not when the list is fetched: a run whose claim
  // is already in flight must not be offered again, and the run page
  // re-renders the moment that claim settles (so a failed claim comes back).
  const next = pending.find((r) => {
    if (dismissed.has(r.id)) return false;
    if (isRunClaiming(r.id)) return false;
    return true;
  });
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
        setDismissed((s) => {
          const updated = new Set(s).add(next.id);
          localStorage.setItem("dismissed_pending_claims", JSON.stringify([...updated]));
          return updated;
        });
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
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => {
              setDismissed((s) => {
                const updated = new Set(s).add(next.id);
                localStorage.setItem("dismissed_pending_claims", JSON.stringify([...updated]));
                return updated;
              });
              log.info("user dismissed pending claim", { runId: next.id });
            }}
            className="flex-1 rounded-full bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
          >
            {t("pendingClaim.later")}
          </button>
          <button
            onClick={runClaim}
            disabled={state === "pending"}
            className="flex-1 rounded-full bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {state === "pending"
              ? t("pendingClaim.pending")
              : t("pendingClaim.cta")}
          </button>
        </div>
      </div>
    </div>
  );
}
