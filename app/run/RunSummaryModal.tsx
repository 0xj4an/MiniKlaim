"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { type TranslationKey, useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { formatSpeed } from "@/lib/map/geo";
import {
  type MoveMode,
  moveMode,
  moveModeIcon,
  moveModeLabelKey,
} from "@/lib/runs/moveMode";
import { HexDot } from "@/app/Hex";
import { groupNumber } from "@/lib/formatNumber";
import { shareTo } from "@/lib/client/share";
import { badgeCopy } from "@/lib/onchain/badgeArt";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { isBadgeClaimPending } from "@/lib/wallet/claimInFlight";
import type { ClaimAllOutcome } from "@/lib/wallet/useClaimAll";
import { useMintTokens } from "@/lib/wallet/useMintTokens";
import { ChallengeMovedNote } from "./ChallengeRunBits";
import { RunBreakdown } from "./RunBreakdown";
import type { LevelRange } from "@/lib/runs/levelRange";
import { StreakNote } from "./StreakNote";
import { STREAK_MIN_SERVER_METERS } from "@/lib/runs/streakMath";
import { emptyRunReason, shareKind } from "@/lib/runs/runSummaryCopy";

const Confetti = dynamic(() => import("react-confetti"), { ssr: false });

const log = createLogger("ui:runSummary");

export type RunSummary = {
  /** The run's id: a shared run links to its own page, /r/<id>. */
  id?: string;
  durationMs: number;
  hexesClaimed: number;
  /** Hex strength: own blocks raised a level, others' blocks lowered. */
  hexesReinforced?: number;
  hexesDamaged?: number;
  /** Of `hexesClaimed`, the blocks taken from another player. */
  hexesStolen?: number;
  /** The levels the reinforced blocks reached, when the phone saw them. */
  reinforcedLevels?: LevelRange | null;
  /** The levels the attacked blocks were left at. */
  attackedLevels?: LevelRange | null;
  /** What the card shows: the larger of the phone's figure and the server's. */
  distanceMeters: number;
  /** The server's hex path, which is what the streak counts. */
  serverDistanceMeters?: number;
  /** The capture status the run finished in (lib/runs/captureStatus). */
  captureState?: string;
  /** The run's label from the server (the player's pick when they made one). */
  moveMode?: MoveMode | null;
};

/**
 * Post-finish modal. Shows the blocks, and badges once they are known.
 * The wallet opens as soon as there are blocks. Share stays behind
 * success. A decline leaves Reclamar so they can retry.
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
  onClaim?: () => Promise<ClaimAllOutcome>;
}) {
  const { t, locale } = useLocale();
  const chainKey = useActiveChainKey();
  const [phase, setPhase] = useState<"idle" | "pending" | "done" | "error">(
    "idle",
  );
  // Whether the relayer paid this claim, which the finish line says out loud.
  const [sponsored, setSponsored] = useState(false);
  // The NFTs are the player's own to buy, so the offer lives here with its
  // price and its signature count rather than waiting to be discovered in
  // the profile.
  const [nftDismissed, setNftDismissed] = useState(false);
  const {
    status: tokenStatus,
    state: mintState,
    affordable: mintAffordable,
    lastMinted,
    mint,
    reload: reloadTokens,
  } = useMintTokens((address as `0x${string}` | null) ?? null);
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
  const mode = summary.moveMode ?? moveMode(summary.distanceMeters, totalSec);
  const hasBadges = (badgeIds?.length ?? 0) > 0;
  const reinforced = summary.hexesReinforced ?? 0;
  const damaged = summary.hexesDamaged ?? 0;
  const stolen = summary.hexesStolen ?? 0;
  const previewReady = badgeIds !== null;
  // Why the run captured nothing, and what there is to share (if anything).
  const emptyReason = emptyRunReason(summary.captureState);
  const sharing = shareKind({
    hexesClaimed: summary.hexesClaimed,
    badgeCount: badgeIds?.length ?? 0,
  });
  const caption = shareCaption(
    sharing,
    summary,
    badgeIds ?? [],
    timeLabel,
    distLabel,
    locale,
    t,
  );
  // Blocks are already known. Waiting on the badge list held the wallet
  // sheet behind a second copy of the same eligibility query.
  const canClaim =
    !!onClaim &&
    (summary.hexesClaimed > 0 || (previewReady && hasBadges));

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
      const outcome = await onClaim();
      if (outcome !== "failed") {
        setSponsored(outcome === "sponsored");
        setPhase("done");
        // This run's blocks only became mintable a moment ago.
        reloadTokens();
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
        : // Who paid is worth saying only when it was not the player: the
          // claim became free on 4 Nov 2026 and nothing on screen said so.
          sponsored
          ? t("run.summary.claimedFree")
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
      {/* Three parts: the close button and the last button never move, and
          only the middle scrolls. As one scrolling column the sheet ran
          taller than the phone, and reaching "Done" scrolled the result
          off the top, cut in half (0xj4an, 23 Nov 2026). dvh where the
          browser has it: vh counts the space behind MiniPay's own bars. */}
      <div
        data-claim-sheet="finish"
        className="sheet-up relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white text-left shadow-2xl sm:rounded-3xl"
        style={{ maxHeight: "90dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-1 right-1 z-10 flex h-11 w-11 items-center justify-center rounded-full text-zinc-500"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-1.5">
        {/* The count is the sheet's title. A run with no new blocks has
            none, so it gets the plain one. */}
        {summary.hexesClaimed === 0 && (
          <p className="mk-title pr-9 text-2xl text-zinc-900">
            {t("run.summary.header")}
          </p>
        )}
        {summary.hexesClaimed > 0 && (
          <div className="relative flex flex-wrap items-baseline gap-x-2 pr-8 text-mine">
            {phase === "done" && (
              <ClaimBurst count={summary.hexesClaimed} />
            )}
            <span
              className={`mk-num text-[3.5rem] leading-[0.9] ${
                phase === "done" ? "claim-count" : ""
              }`}
            >
              {groupNumber(summary.hexesClaimed, locale)}
            </span>
            <span className="mk-title text-2xl">
              {t(
                summary.hexesClaimed === 1
                  ? "run.summary.yours.one"
                  : "run.summary.yours",
              )}
            </span>
          </div>
        )}
        {/* What the run did, a line per kind of thing: see RunBreakdown. */}
        <RunBreakdown
          blocks={summary.hexesClaimed}
          stolen={stolen}
          reinforced={reinforced}
          attacked={damaged}
          reinforcedLevels={summary.reinforcedLevels}
          attackedLevels={summary.attackedLevels}
        />
        {/* The run's own facts sit with its result, on one line: as three
            boxes they cost the sheet a fifth of a small phone. */}
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px] leading-tight text-zinc-500">
          <span className="mk-num text-[1.0625rem] text-zinc-900">
            {timeLabel}
          </span>
          <span className="mk-num text-[1.0625rem] text-zinc-900">
            {distLabel}
          </span>
          <span>{speedLabel}</span>
          {mode && (
            <span>
              {moveModeIcon(mode)} {t(moveModeLabelKey(mode))}
            </span>
          )}
        </p>
        {summary.hexesClaimed === 0 && previewReady && !hasBadges && (
          // A run that only reinforced, or only passed blocks already used
          // today, ends with no claim step, and players wrote in asking how
          // to claim (support, 12 Nov 2026). Say there is nothing to claim.
          <p className="mt-2 text-[15px] leading-snug text-zinc-700">
            {emptyReason === null || reinforced > 0 || damaged > 0
              ? t("run.summary.nothingNew")
              : t(`run.summary.empty.${emptyReason}`)}
          </p>
        )}
        <div className="mt-2.5 border-t border-zinc-200">
        <StreakNote
          address={address}
          countedThisRun={
            summary.hexesClaimed > 0 ||
            reinforced > 0 ||
            damaged > 0 ||
            (summary.serverDistanceMeters ?? summary.distanceMeters) >=
              STREAK_MIN_SERVER_METERS
          }
        />
        <ChallengeMovedNote address={address} />
        </div>
        {hasBadges && (
          // A bare "Ultra - Run 500 km total" row did not say what it was.
          <p className="mt-3 text-sm font-semibold text-orange-700">
            {t(
              badgeIds?.length === 1
                ? "run.summary.badgeEarned"
                : "run.summary.badgesEarned",
            )}
          </p>
        )}
        {hasBadges && (
          <ul className="mt-1.5 border-t border-zinc-200">
            {badgeIds?.map((id, index) => (
              <li
                key={id}
                className={`flex items-center gap-2.5 border-b border-zinc-200 py-2.5 ${
                  phase === "done" ? "claim-badge" : ""
                }`}
                style={
                  phase === "done"
                    ? { animationDelay: `${index * 70}ms` }
                    : undefined
                }
              >
                <HexDot className="h-5 w-[18px] shrink-0 text-mine" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px] leading-tight font-semibold text-zinc-900">
                    {badgeCopy(id, locale).name}
                  </span>
                  {badgeCopy(id, locale).description && (
                    <span className="text-[13px] leading-tight text-zinc-500">
                      {badgeCopy(id, locale).description}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(summary.hexesClaimed > 0 || hasBadges) && (
          <p
            className={`mt-2.5 flex items-center gap-1.5 text-[13px] leading-tight ${
              phase === "error" ? "text-red-600" : "text-zinc-500"
            }`}
          >
            {phase === "done" && (
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0 text-emerald-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12.5 4.5 4.500L19 7" />
              </svg>
            )}
            {claimLine}
          </p>
        )}
        {phase === "done" &&
          !nftDismissed &&
          tokenStatus?.enabled &&
          tokenStatus.recorded > 0 && (
            // One row: what it is, what it costs the player, and the two
            // answers. As a paragraph over two buttons it was the tallest
            // thing on the sheet.
            <div className="mk-well mt-2.5 flex items-center gap-2 py-2 pr-1 pl-3">
              <p className="min-w-0 flex-1 text-[13px] leading-tight text-zinc-600">
                <span className="block text-sm font-semibold text-zinc-900">
                  {t("run.summary.nftTitle").replace(
                    "{count}",
                    groupNumber(tokenStatus.recorded, locale),
                  )}
                </span>
                {(() => {
                  const usd =
                    tokenStatus.plan?.usd ??
                    tokenStatus.quotes.find(
                      (q) => q.count === tokenStatus.nextBatch,
                    )?.usd ??
                    null;
                  return usd === null
                    ? t("run.summary.nftOfferNoPrice")
                    : t("run.summary.nftOffer").replace(
                        "{usd}",
                        usd.toFixed(2),
                      );
                })()}
                {(tokenStatus.plan?.signatures ?? 1) > 1 &&
                  ` ${t("run.summary.nftBatches").replaceAll(
                    "{signatures}",
                    String(tokenStatus.plan.signatures),
                  )}`}
              </p>
              <button
                type="button"
                className="mk-btn mk-btn-sm mk-btn-ink shrink-0 px-3.5 disabled:opacity-60"
                disabled={
                  mintState === "fetching-voucher" ||
                  mintState === "sending" ||
                  mintState === "confirming"
                }
                onClick={() => {
                  track("run_summary_nft_tapped", {
                    pending: tokenStatus.recorded,
                    signatures: tokenStatus.plan?.signatures ?? 1,
                  });
                  void mint();
                }}
              >
                {mintState === "fetching-voucher" || mintState === "sending"
                  ? t("me.nfts.minting")
                  : mintState === "confirming"
                    ? t("me.nfts.confirming")
                    : t("run.summary.nftGo")}
              </button>
              <button
                type="button"
                aria-label={t("run.summary.nftLater")}
                className="flex h-11 w-9 shrink-0 items-center justify-center text-zinc-500"
                onClick={() => {
                  track("run_summary_nft_skipped", {
                    pending: tokenStatus.recorded,
                  });
                  setNftDismissed(true);
                }}
              >
                <svg
                  aria-hidden
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        {/* What the tap came to. The row above went back to "Mint" after a
            failure and said nothing, so a wallet that asked twice and then
            refused read as an app that did nothing (26 Nov 2026). */}
        {phase === "done" && !nftDismissed && tokenStatus?.enabled && (
          <>
            {mintState === "done" && lastMinted > 0 && (
              <p role="status" className="mt-1.5 text-[13px] leading-tight text-green-700">
                {t("me.nfts.done").replace(
                  "{count}",
                  groupNumber(lastMinted, locale),
                )}
              </p>
            )}
            {mintState === "no_fee" && (
              <div role="status" className="mt-1.5 text-[13px] leading-tight text-red-600">
                <p>{t("me.nfts.noFee")}</p>
                {mintAffordable !== null && (
                  <button
                    type="button"
                    className="mk-btn mk-btn-sm mk-btn-ink mt-1.5 px-3.5"
                    onClick={() => {
                      track("run_summary_nft_tapped", {
                        pending: tokenStatus.recorded,
                        signatures: 1,
                        smaller: mintAffordable,
                      });
                      void mint(mintAffordable);
                    }}
                  >
                    {t("run.summary.nftMintSome").replace(
                      "{count}",
                      groupNumber(mintAffordable, locale),
                    )}
                  </button>
                )}
              </div>
            )}
            {mintState === "refused" && (
              <p role="status" className="mt-1.5 text-[13px] leading-tight text-amber-700">
                {t("me.nfts.refused")}
              </p>
            )}
            {mintState === "error" && (
              <p role="status" className="mt-1.5 text-[13px] leading-tight text-red-600">
                {t("me.nfts.error")}
              </p>
            )}
          </>
        )}
        {phase === "done" && nftDismissed && (
          <p className="mt-2.5 text-[13px] leading-tight text-zinc-500">
            {t("run.summary.nftSkipped")}
          </p>
        )}
        {/* A player with no name yet meets the ask here, on blocks they
            already hold, and only once the claim is settled: leaving the
            sheet mid-claim would strand it. */}
        {!username && (phase === "done" || (previewReady && !canClaim)) && (
          <div className="mk-well mt-2.5 flex items-center justify-between gap-3 px-3 py-2">
            <p className="min-w-0 text-[13px] leading-snug text-zinc-700">
              {t("run.summary.nameless")}
            </p>
            <Link
              href="/me"
              className="mk-btn mk-btn-sm mk-btn-ghost shrink-0 px-3"
            >
              {t("run.summary.nameCta")}
            </Link>
          </div>
        )}
        {phase === "done" && shareNote && (
          <p className="mt-2.5 text-[13px] leading-tight text-zinc-500">
            {shareNote}
          </p>
        )}
        {phase === "done" && caption && (
          // The word and the three places on one line. The narrowest phones
          // drop the word: the names say what the buttons are.
          <div className="mt-2.5 flex items-center gap-2">
            <span className="hidden shrink-0 text-sm font-medium text-zinc-500 min-[350px]:block">
              {t("run.summary.share")}
            </span>
            <button
              type="button"
              aria-label={`${t("run.summary.share")} X`}
              onClick={() =>
                void shareClaim("x", caption, username, t, setShareNote)
              }
              className="mk-btn mk-btn-sm mk-btn-ghost w-11 shrink-0 px-0"
            >
              X
            </button>
            <button
              type="button"
              onClick={() =>
                void shareClaim("facebook", caption, username, t, setShareNote)
              }
              className="mk-btn mk-btn-sm mk-btn-ghost min-w-0 flex-1 px-1"
            >
              Facebook
            </button>
            <button
              type="button"
              onClick={() =>
                void shareClaim("instagram", caption, username, t, setShareNote)
              }
              className="mk-btn mk-btn-sm mk-btn-ghost min-w-0 flex-1 px-1"
            >
              Instagram
            </button>
          </div>
        )}
        </div>
        <div
          className="shrink-0 px-4 pt-2.5"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          {phase === "done" ? (
            <button onClick={onClose} className="mk-btn w-full px-4">
              {t("run.summary.done")}
            </button>
          ) : canClaim ? (
            <button
              onClick={() => claim("button")}
              disabled={phase === "pending"}
              className="mk-btn w-full px-4 disabled:opacity-70"
            >
              {phase === "pending"
                ? t("run.summary.claiming")
                : t("pendingClaim.cta")}
            </button>
          ) : previewReady ? (
            <button onClick={onClose} className="mk-btn w-full px-4">
              {t("run.summary.done")}
            </button>
          ) : null}
        </div>
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

type ShareCaption = {
  text: string;
  kind: "blocks" | "badges";
  /** Path the post links to: the run's page, which carries its picture. */
  path: string | null;
};

/**
 * What the share buttons post, or null when the run has nothing worth
 * sharing (see shareKind). A run that only collected badges talks about the
 * badges, never about "0 blocks". Time and distance go in only when the run
 * covered some distance: "00:12 - 0 m route" on a block captured standing
 * still reads as the game not working.
 */
function shareCaption(
  kind: "blocks" | "badges" | "none",
  summary: RunSummary,
  badgeIds: number[],
  timeLabel: string,
  distLabel: string,
  locale: "en" | "es",
  t: (key: TranslationKey) => string,
): ShareCaption | null {
  if (kind === "none") return null;
  if (kind === "badges") {
    const text =
      badgeIds.length === 1
        ? t("run.share.badge.one").replace("{name}", badgeCopy(badgeIds[0], locale).name)
        : t("run.share.badge.many").replace("{n}", String(badgeIds.length));
    return { text, kind, path: null };
  }
  const captured =
    summary.hexesClaimed === 1
      ? t("run.share.text.one")
      : t("run.share.text.many").replace("{n}", String(summary.hexesClaimed));
  const head = `${captured} ${t("run.share.text.suffix")}`;
  // A block taken from someone is the event of a run, so the post says it.
  const stolen = Math.min(summary.hexesStolen ?? 0, summary.hexesClaimed);
  const stole =
    stolen > 0
      ? ` ${t(
          stolen === 1 ? "run.share.text.stolen.one" : "run.share.text.stolen",
        ).replace("{n}", String(stolen))}`
      : "";
  const route =
    summary.distanceMeters > 0
      ? ` ${t("run.share.text.route")
          .replace("{dist}", distLabel)
          .replace("{time}", timeLabel)}`
      : "";
  const text = `${head}${stole}${route}`;
  return { text, kind, path: summary.id ? `/r/${summary.id}` : null };
}

async function shareClaim(
  channel: "x" | "facebook" | "instagram",
  caption: ShareCaption | null,
  username: string | null,
  t: (key: TranslationKey) => string,
  setNote: (note: string | null) => void,
): Promise<void> {
  if (!caption) return;
  track("share_button_pressed", {
    surface: "run_summary",
    channel,
    kind: caption.kind,
  });
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.miniklaim.fun";
  // A run links to its own page, whose preview is a picture of the run
  // (app/r/[id]/opengraph-image). Badges link to the profile, as before.
  const url = caption.path
    ? `${origin}${caption.path}`
    : username
      ? `${origin}/p/${username}`
      : origin;
  const method = await shareTo(channel, caption.text, url);
  track("share_result", { surface: "run_summary", channel, method });
  if (method === "copied" || (method === "intent" && channel === "instagram")) {
    setNote(t("me.share.copiedPaste"));
    window.setTimeout(() => setNote(null), 3000);
  } else if (method === "none") {
    setNote(null);
  }
}
