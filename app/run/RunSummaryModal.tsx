"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { track } from "@/lib/analytics";
import { type TranslationKey, useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { formatSpeed } from "@/lib/map/geo";
import { moveMode, moveModeLabelKey } from "@/lib/runs/moveMode";
import { badgeCopy } from "@/lib/onchain/badgeArt";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { isBadgeClaimPending } from "@/lib/wallet/claimInFlight";

const Confetti = dynamic(() => import("react-confetti"), { ssr: false });

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
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const totalSec = Math.max(0, Math.floor(summary.durationMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const timeLabel = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const distLabel =
    summary.distanceMeters >= 1000
      ? `${(summary.distanceMeters / 1000).toFixed(2)} km`
      : `${summary.distanceMeters} m`;
  const speedLabel = formatSpeed(summary.durationMs, summary.distanceMeters);
  const mode = moveMode(summary.distanceMeters, totalSec);
  const modeLabel = mode ? t(moveModeLabelKey(mode)) : null;
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
      if (ok) {
        setPhase("done");
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
      } else {
        setPhase("error");
      }
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
    <>
      {showConfetti && (
        <Confetti
          width={typeof window !== "undefined" ? window.innerWidth : 300}
          height={typeof window !== "undefined" ? window.innerHeight : 600}
          recycle={false}
          numberOfPieces={200}
          gravity={0.3}
        />
      )}
      <div
        className="absolute inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
        onClick={
          phase === "done" || (previewReady && !canClaim) ? onClose : undefined
        }
      >
      <div
        data-claim-sheet="finish"
        className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-white px-5 pt-5 shadow-2xl sm:rounded-3xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <p className="text-center text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          {t("run.summary.header")}
        </p>
        {summary.hexesClaimed > 0 && (
          <div className="relative mt-3 text-center">
            {phase === "done" && (
              <ClaimBurst count={summary.hexesClaimed} />
            )}
            <div
              className={`font-mono text-5xl leading-none font-bold text-zinc-900 ${
                phase === "done" ? "claim-count" : ""
              }`}
            >
              {summary.hexesClaimed}
            </div>
            <div className="mt-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              {t("run.summary.blocks")}
            </div>
          </div>
        )}
        {hasBadges && (
          <ul className="mt-4 border-t border-zinc-100">
            {badgeIds?.map((id, index) => (
              <li
                key={id}
                className={`flex items-center gap-3 border-b border-zinc-100 py-2.5 ${
                  phase === "done" ? "claim-badge" : ""
                }`}
                style={
                  phase === "done"
                    ? { animationDelay: `${index * 70}ms` }
                    : undefined
                }
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
          {modeLabel ? ` - ${modeLabel}` : ""}
        </p>
        {phase === "done" ? (
          <div className="mt-4 flex flex-col gap-2">
            {shareNote && (
              <p className="text-center text-xs text-zinc-500">{shareNote}</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  void shareClaim(
                    "x",
                    summary,
                    timeLabel,
                    distLabel,
                    username,
                    t,
                    setShareNote,
                  )
                }
                className="min-h-11 rounded-full border border-zinc-300 bg-white px-2 py-2 text-sm font-semibold text-zinc-800"
              >
                X
              </button>
              <button
                type="button"
                onClick={() =>
                  void shareClaim(
                    "facebook",
                    summary,
                    timeLabel,
                    distLabel,
                    username,
                    t,
                    setShareNote,
                  )
                }
                className="min-h-11 rounded-full border border-zinc-300 bg-white px-2 py-2 text-sm font-semibold text-zinc-800"
              >
                Facebook
              </button>
              <button
                type="button"
                onClick={() =>
                  void shareClaim(
                    "instagram",
                    summary,
                    timeLabel,
                    distLabel,
                    username,
                    t,
                    setShareNote,
                  )
                }
                className="min-h-11 rounded-full border border-zinc-300 bg-white px-2 py-2 text-sm font-semibold text-zinc-800"
              >
                Instagram
              </button>
            </div>
            <button
              onClick={onClose}
              className="min-h-11 w-full rounded-full bg-orange-700 px-4 py-2 text-sm font-semibold text-white"
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
    </>
  );
}

const BURST = [
  { x: -56, y: -46 },
  { x: 52, y: -50 },
  { x: -28, y: -58 },
  { x: 24, y: -62 },
  { x: -8, y: -70 },
  { x: 40, y: -36 },
  { x: -44, y: -28 },
];

function ClaimBurst({ count }: { count: number }) {
  return (
    <>
      <span className="claim-plus pointer-events-none absolute top-0 left-1/2 font-mono text-2xl font-bold text-orange-600">
        +{count}
      </span>
      {BURST.map((spot, i) => (
        <span
          key={i}
          aria-hidden
          className="claim-hex pointer-events-none absolute top-4 left-1/2 h-3 w-3 bg-orange-600"
          style={{
            clipPath:
              "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            ["--dx" as string]: `${spot.x}px`,
            ["--dy" as string]: `${spot.y}px`,
            animationDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </>
  );
}

function claimCaption(
  summary: RunSummary,
  timeLabel: string,
  distLabel: string,
  t: (key: TranslationKey) => string,
): { text: string; url: string } {
  const captured =
    summary.hexesClaimed === 1
      ? t("run.share.text.one")
      : t("run.share.text.many").replace("{n}", String(summary.hexesClaimed));
  const text = `${captured} ${t("run.share.text.suffix")} ${timeLabel} - ${distLabel} ${t("run.share.text.run")}`;
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.miniklaim.fun";
  return { text, url: origin };
}

async function shareClaim(
  channel: "x" | "facebook" | "instagram",
  summary: RunSummary,
  timeLabel: string,
  distLabel: string,
  username: string | null,
  t: (key: TranslationKey) => string,
  setNote: (note: string | null) => void,
): Promise<void> {
  track("share_button_pressed", { surface: "run_summary", channel });
  const { text, url: origin } = claimCaption(summary, timeLabel, distLabel, t);
  const url = username ? `${origin}/p/${username}` : origin;
  const caption = `${text} ${url}`;

  if (channel === "instagram") {
    try {
      await navigator.clipboard.writeText(caption);
      setNote(t("me.share.copied"));
      window.setTimeout(() => setNote(null), 2000);
    } catch {
      setNote(null);
    }
    
    const nativeUrl = "instagram://camera";
    const webUrl = "https://www.instagram.com/";
    
    window.location.href = nativeUrl;
    
    window.setTimeout(() => {
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }, 1500);
    return;
  }

  if (channel === "x") {
    const nativeUrl = `twitter://post?message=${encodeURIComponent(caption)}`;
    const webUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    
    window.location.href = nativeUrl;
    
    window.setTimeout(() => {
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }, 1500);
  } else {
    const nativeUrl = `fb://facewebmodal/f?href=${encodeURIComponent(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`)}`;
    const webUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`;
    
    window.location.href = nativeUrl;
    
    window.setTimeout(() => {
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }, 1500);
  }
}
