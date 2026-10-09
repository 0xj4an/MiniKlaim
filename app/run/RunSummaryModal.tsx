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
  id?: string;
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
  const [shareNote, setShareNote] = useState<string | null>(null);
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

  useEffect(() => {
    if (phase !== "idle" || !canClaim) return;
    void claim("auto_finish");
  }, [phase, canClaim]);

  const claim = async (via: "auto_finish" | "button") => {
    if (!onClaim || phase === "pending") return;
    track("run_summary_claim_tapped", {
      blocks: summary.hexesClaimed,
      via,
    });
    setPhase("pending");
    try {
      const ok = await onClaim();
      if (ok) {
        setPhase("done");
        const parts: string[] = [];
        if (summary.hexesClaimed > 0) {
          parts.push(
            summary.hexesClaimed === 1
              ? t("run.share.text.one")
              : t("run.share.text.many").replace(
                  "{n}",
                  String(summary.hexesClaimed),
                ),
          );
        }
        if (hasBadges && badgeIds && badgeIds.length > 0) {
          const badge = badgeCopy(badgeIds[0], locale === "es" ? "es" : "en");
          parts.push(`🏆 ${badge.name}`);
        }
        setShareNote(parts.join(" "));
      } else {
        setPhase("error");
      }
    } catch (e) {
      log.error("claim error", {
        message: e instanceof Error ? e.message : String(e),
      });
      setPhase("error");
    }
  };

  const totalSec = Math.max(0, Math.floor(summary.durationMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const timeLabel = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const distLabel =
    summary.distanceMeters >= 1000
      ? `${(summary.distanceMeters / 1000).toFixed(2)} km`
      : `${summary.distanceMeters} m`;
  const speedLabel = formatSpeed(summary.durationMs, summary.distanceMeters);

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={phase === "done" ? onClose : undefined}
    >
      <div
        className="mx-6 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
          {t("run.summary.header")}
        </p>

        {/* Claimed blocks and badges */}
        <div className="flex w-full flex-col gap-2">
          {summary.hexesClaimed > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-blue-50 p-4">
              <span className="text-sm font-medium text-blue-900">
                {t("run.summary.blocks")}
              </span>
              <span className="text-2xl font-bold text-blue-600">
                {summary.hexesClaimed}
              </span>
            </div>
          )}
          {hasBadges && badgeIds && badgeIds.length > 0 && (
            <div className="flex flex-col gap-2">
              {badgeIds.map((id, index) => {
                const badge = badgeCopy(id, locale === "es" ? "es" : "en");
                return (
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-yellow-50 to-orange-50 p-3"
                    style={
                      index < 3
                        ? { animationDelay: `${index * 70}ms` }
                        : undefined
                    }
                  >
                    <span className="text-3xl">{badge.emoji}</span>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-zinc-900">
                        {badge.name}
                      </span>
                      <span className="text-xs text-zinc-600">
                        {badge.description}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid w-full grid-cols-3 gap-2 text-center">
          <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 p-2">
            <span className="text-lg font-bold text-zinc-900">{timeLabel}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {t("run.summary.time")}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 p-2">
            <span className="text-lg font-bold text-zinc-900">{distLabel}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {t("run.summary.distance")}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-zinc-50 p-2">
            <span className="text-lg font-bold text-zinc-900">{speedLabel}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              {t("run.summary.speed")}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex w-full flex-col gap-2">
          {phase === "idle" && canClaim && (
            <button
              onClick={() => claim("button")}
              className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 py-3 text-sm font-semibold text-white shadow-md hover:from-blue-600 hover:to-blue-700"
            >
              {t("run.summary.claim")}
            </button>
          )}
          {phase === "pending" && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-zinc-100 py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              <span className="text-sm font-medium text-zinc-600">
                {t("run.summary.claiming")}
              </span>
            </div>
          )}
          {phase === "error" && (
            <button
              onClick={() => claim("button")}
              className="w-full rounded-lg bg-red-500 py-3 text-sm font-semibold text-white hover:bg-red-600"
            >
              {t("run.summary.retry")}
            </button>
          )}
          {phase === "done" && shareNote && (
            <button
              onClick={() => {
                const url = username
                  ? `https://miniklaim.com/p/${username}`
                  : "https://miniklaim.com";
                const text = encodeURIComponent(`${shareNote}\n${url}`);
                window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
                track("run_share_tapped", { blocks: summary.hexesClaimed });
              }}
              className="w-full rounded-lg bg-gradient-to-r from-green-500 to-green-600 py-3 text-sm font-semibold text-white shadow-md hover:from-green-600 hover:to-green-700"
            >
              {t("run.summary.share")}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-zinc-200 bg-white py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
