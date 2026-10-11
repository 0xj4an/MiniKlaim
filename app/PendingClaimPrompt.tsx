"use client";

import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { CloseButton } from "@/app/CloseButton";
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
  // Closed for this visit. It comes back next time the app opens, which is
  // what counts the offers toward a sponsored mint.
  const [closed, setClosed] = useState(false);
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
  // Count one offer per run per visit. The server ignores repeats within a
  // few hours, so focus events and reloads do not inflate it. After enough
  // offers a player who cannot pay gets the run minted by the relayer.
  const offeredRef = useRef<Set<string>>(new Set());
  const nextId = next?.id ?? null;
  useEffect(() => {
    if (!nextId || !enabled || !address) return;
    if (offeredRef.current.has(nextId)) return;
    offeredRef.current.add(nextId);
    void fetch(`/api/runs/${nextId}/offered`, { method: "POST" }).catch(() => {
      // Best effort; the next visit counts it.
    });
  }, [nextId, enabled, address]);

  if (!next || !enabled || !address || closed) return null;

  const close = () => {
    if (state !== "pending") setClosed(true);
  };

  const totalBlocks = pending.reduce((sum, r) => sum + (r.pendingHexes ?? 0), 0);

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={close}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CloseButton
          onClick={close}
          label={t("pendingClaim.later")}
          className="absolute top-3 right-3"
        />
        <p className="px-8 text-center text-base font-bold text-zinc-900">
          {t("pendingClaim.title")}
        </p>
        <p className="mt-2 text-center text-sm text-zinc-500">
          {t("pendingClaim.body")}
        </p>
        {pending.length > 1 && (
          <p className="mt-1 text-center text-xs font-medium text-orange-700">
            {t("pendingClaim.total")
              .replace("{runs}", String(pending.length))
              .replace("{blocks}", String(totalBlocks))}
          </p>
        )}
        <div className="mt-4 flex justify-center gap-8 text-center">
          <div>
            <div className="font-mono text-xl font-bold text-zinc-900">
              {next.pendingHexes ?? next.hexesClaimed}
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
        <button
            onClick={runClaim}
            disabled={state === "pending"}
            className="mt-5 w-full rounded-full bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {state === "pending"
              ? t("pendingClaim.pending")
              : t("pendingClaim.cta")}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={state === "pending"}
          className="mt-2 w-full py-2 text-sm font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-60"
        >
          {t("pendingClaim.later")}
        </button>
      </div>
    </div>
  );
}
