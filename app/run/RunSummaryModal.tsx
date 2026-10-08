"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { type TranslationKey, useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { formatSpeed } from "@/lib/map/geo";
import { badgeCopy } from "@/lib/onchain/badgeArt";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { isBadgeClaimPending } from "@/lib/wallet/claimInFlight";

const log = createLogger("ui:runSummary");

export type RunSummary = {
  durationMs: number;
  hexesClaimed: number;
  distanceMeters: number;
};

/**
 * Post-finish modal. Shows the blocks and any badges this claim will
 * include, then opens the wallet on its own. Share stays behind success.
 * A decline leaves Reclamar so they can retry.
 */
export function RunSummaryModal({
  summary,
  username,
  address,
  onClose,
  onClaim,
}: {
  summary: RunSummary;
  username: string | null;
  address: string | null;
  onClose: () => void;
  onClaim?: () => Promise<boolean>;
}) {
  const { t, locale } = useLocale();
  const chainKey = useActiveChainKey();
  const [phase, setPhase] = useState<"idle" | "pending" | "done" | "error">(
    "idle",
  );
  const [badgeIds, setBadgeIds] = useState<number[] | null>(null);
  const totalSec = Math.max(0, Math.floor(summary.durationMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const timeLabel = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const distLabel =
    summary.distanceMeters >= 1000
      ? `${(summary.distanceMeters / 1000).toFixed(2)} km`
      : `${summary.distanceMeters} m`;
  const speedLabel = formatSpeed(summary.durationMs, summary.distanceMeters);
  const hasBadges = (badgeIds?.length ?? 0) > 0;
  const previewReady = badgeIds !== null;
  const canClaim =
    previewReady &&
    (summary.hexesClaimed > 0 || hasBadges) &&
    !!onClaim;

  useEffect(() => {
    if (!address) {
      setBadgeIds([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setBadgeIds((cur) => cur ?? []);
    }, 2000);
    void (async () => {
      try {
        const res = await fetch(
          `/api/users/${address.toLowerCase()}/badges?chain=${chainKey}&claimable=1`,
        );
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as { claimableIds?: number[] };
        const ids = (data.claimableIds ?? []).filter(
          (id) => !isBadgeClaimPending(id),
        );
        if (!cancelled) setBadgeIds(ids);
      } catch (e) {
        log.warn("claimable badges preview failed", {
          message: e instanceof Error ? e.message : String(e),
        });
        if (!cancelled) setBadgeIds([]);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, chainKey]);

  const trackedBadges = useRef(false);
  useEffect(() => {
    if (!badgeIds?.length || trackedBadges.current) return;
    trackedBadges.current = true;
    for (const id of badgeIds) {
      track("badge_unlocked", {
        badge_id: id,
        badge_name: badgeCopy(id, "en").name,
      });
    }
  }, [badgeIds]);

  const claim = async (via: "auto_finish" | "button") => {
    if (!onClaim || phase === "pending") return;
    track("run_summary_claim_tapped", {
      blocks: summary.hexesClaimed,
      via,
    });
    setPhase("pending");
    try {
      const ok = await onClaim();
      setPhase(ok ? "done" : "error");
    } catch {
      setPhase("error");
    }
  };

  const asked = useRef(false);
  useEffect(() => {
    if (!canClaim || asked.current) return;
    asked.current = true;
    void claim("auto_finish");
    // One sheet per finish. A decline retries from the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canClaim]);

  const claimLine =
    phase === "done"
      ? hasBadges
        ? t("run.summary.claimedBoth")
        : t("run.summary.claimed")
      : phase === "error"
        ? t("pendingClaim.error")
        : hasBadges
          ? t("run.summary.claimBoth")
          : t("run.summary.claim");

  return (
    <div
      className="absolute inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={
        phase === "done" || (previewReady && !canClaim) ? onClose : undefined
      }
    >
      <div
        data-claim-sheet="finish"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-white px-5 pt-5 shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          {t("run.summary.header")}
        </p>
        {summary.hexesClaimed > 0 && (
          <div className="mt-3 text-center">
            <div className="font-mono text-5xl leading-none font-bold text-zinc-900">
              {summary.hexesClaimed}
            </div>
            <div className="mt-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              {t("run.summary.blocks")}
            </div>
          </div>
        )}
        {hasBadges && (
          <ul className="mt-4 border-t border-zinc-100">
            {badgeIds?.map((id) => (
              <li
                key={id}
                className="flex items-center gap-3 border-b border-zinc-100 py-2.5"
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 bg-orange-600"
                  style={{
                    clipPath:
                      "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                  }}
                />
                <span className="text-sm font-semibold text-zinc-900">
                  {badgeCopy(id, locale).name}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(summary.hexesClaimed > 0 || hasBadges) && (
          <p
            className={`mt-4 text-center text-sm ${
              phase === "error" ? "text-red-600" : "text-zinc-800"
            }`}
          >
            {claimLine}
          </p>
        )}
        <p className="mt-2 text-center text-xs text-zinc-500">
          {timeLabel} - {distLabel} - {speedLabel}
        </p>
        {phase === "done" ? (
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => shareRun(summary, timeLabel, distLabel, username, t)}
              className="min-h-11 flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
            >
              {t("run.summary.share")}
            </button>
            <button
              onClick={onClose}
              className="min-h-11 flex-1 rounded-full bg-orange-700 px-4 py-2 text-sm font-semibold text-white"
            >
              {t("run.summary.done")}
            </button>
          </div>
        ) : canClaim ? (
          <button
            onClick={() => claim("button")}
            disabled={phase === "pending"}
            className="mt-4 min-h-11 w-full rounded-full bg-orange-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
          >
            {phase === "pending"
              ? t("run.summary.claiming")
              : t("pendingClaim.cta")}
          </button>
        ) : previewReady ? (
          <button
            onClick={onClose}
            className="mt-4 min-h-11 w-full rounded-full bg-orange-700 px-4 py-2 text-sm font-semibold text-white"
          >
            {t("run.summary.done")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

async function shareRun(
  summary: RunSummary,
  timeLabel: string,
  distLabel: string,
  username: string | null,
  t: (key: TranslationKey) => string,
): Promise<void> {
  track("share_button_pressed", { surface: "run_summary" });
  const captured =
    summary.hexesClaimed === 1
      ? t("run.share.text.one")
      : t("run.share.text.many").replace("{n}", String(summary.hexesClaimed));
  const text = `${captured} ${t("run.share.text.suffix")} ${timeLabel} - ${distLabel} ${t("run.share.text.run")}`;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.miniklaim.fun";
  const url = username ? `${origin}/p/${username}` : origin;

  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      await navigator.share({ text, url });
      return;
    } catch {
      // user cancelled or share failed; fall through to twitter intent
    }
  }
  if (typeof window !== "undefined") {
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  }
}
