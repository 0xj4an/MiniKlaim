"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { track } from "@/lib/analytics";
import { CloseButton } from "@/app/CloseButton";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { badgeCopy, badgeSvg } from "@/lib/onchain/badgeArt";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import {
  dropBadgeClaims,
  isBadgeClaimPending,
  markBadgeClaimSubmitted,
} from "@/lib/wallet/claimInFlight";
import {
  type BadgeClaimFailure,
  useClaimBadges,
} from "@/lib/wallet/useClaimBadges";

const log = createLogger("ui:badgeClaim");

/**
 * Detects badges the player has earned but not yet minted (via the voucher
 * endpoint, the authoritative eligibility source) and prompts them to claim
 * with a single tx. Mounted on /me and on the run page so the pop-up fires the
 * moment a badge is earned after a run, not only when the player visits /me.
 *
 * `refreshKey` re-runs detection when bumped (e.g. after a run finishes).
 * `detectOnMount=false` skips the first detection so the run page only pops
 * after a finish, not on load.
 *
 * `variant="card"` renders the same claim inline instead of as a modal: the
 * home screen uses it so a player who opens the app sees the badges they
 * still have to mint, without a pop-up stacking on the pending-run prompt.
 * "Later" hides it for the rest of the browser session.
 */
export function BadgeClaimPrompt({
  address,
  enabled,
  refreshKey = 0,
  detectOnMount = true,
  variant = "modal",
  surface = "modal",
}: {
  address: Address | null;
  enabled: boolean;
  refreshKey?: number;
  detectOnMount?: boolean;
  variant?: "modal" | "card";
  /** Where the prompt lives, sent with the claim events. */
  surface?: string;
}) {
  const { t, locale } = useLocale();
  const chainKey = useActiveChainKey();
  const { claim, playerPays } = useClaimBadges(address, enabled);
  const [claimable, setClaimable] = useState<number[]>([]);
  // Dollars the claim costs a player who pays it, from the voucher. Null when
  // the chain could not be read: then no price is shown rather than a wrong one.
  const [feeUsd, setFeeUsd] = useState<number | null>(null);
  const [failure, setFailure] = useState<BadgeClaimFailure | null>(null);
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">(
    "idle",
  );
  const [dismissed, setDismissed] = useState(false);
  const skipNext = useRef(!detectOnMount);
  const offered = useRef(false);

  useEffect(() => {
    if (!enabled || !address) {
      setClaimable([]);
      return;
    }
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const heldRes = await fetch(
          `/api/users/${address.toLowerCase()}/badges?chain=${chainKey}`,
        );
        const held = (await heldRes.json()) as {
          contract: string | null;
          heldIds: number[];
        };
        if (!held.contract) return;
        const vRes = await fetch(
          `/api/users/${address.toLowerCase()}/badges/voucher?chain=${chainKey}`,
          { method: "POST" },
        );
        if (vRes.status === 409) {
          if (!cancelled) setClaimable([]);
          return;
        }
        if (!vRes.ok) return;
        const voucher = (await vRes.json()) as {
          badgeIds: string[];
          feeUsd?: number | null;
        };
        if (!cancelled) {
          setFeeUsd(typeof voucher.feeUsd === "number" ? voucher.feeUsd : null);
        }
        const heldSet = new Set(held.heldIds);
        // The chain confirms these, so they no longer need suppressing.
        dropBadgeClaims(held.heldIds);
        // `heldIds` is a chain read, so it lags a submitted claim tx by a
        // confirmation. Without the second check the prompt reappears for
        // badges the player just approved.
        const fresh = voucher.badgeIds
          .map(Number)
          .filter((id) => !heldSet.has(id) && !isBadgeClaimPending(id));
        if (!cancelled && fresh.length > 0) {
          const laterKey = laterStorageKey(address, fresh);
          if (variant === "card" && readLater(laterKey)) {
            setClaimable([]);
            return;
          }
          setClaimable(fresh);
          setDismissed(false);
          setState("idle");
          if (!offered.current) {
            offered.current = true;
            track("badge_claim_offered", { count: fresh.length, surface });
          }
          // The card shows on every app open; badge_unlocked stays tied to
          // the modal, which fires once a badge is earned.
          if (variant === "modal") {
            for (const id of fresh) {
              track("badge_unlocked", {
                badge_id: id,
                badge_name: badgeCopy(id, "en").name,
              });
            }
          }
        } else if (!cancelled) {
          setClaimable([]);
        }
      } catch (e) {
        log.warn("badge claim detection failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, enabled, refreshKey, chainKey, variant, surface]);

  useEffect(() => {
    if (state !== "done") return;
    const id = window.setTimeout(() => setState("idle"), 5000);
    return () => window.clearTimeout(id);
  }, [state]);

  const runClaim = async () => {
    setState("pending");
    track("badge_claim_started", { count: claimable.length, surface });
    // Suppress re-detection for these ids until the chain read catches up.
    // Dropped again below if nothing actually went on-chain.
    markBadgeClaimSubmitted(claimable);
    const outcome = await claim();
    if (outcome.status === "user-claimed" || outcome.status === "sponsored") {
      track("badge_claim_confirmed", {
        count: claimable.length,
        surface,
        tx_hash:
          "txHash" in outcome && typeof outcome.txHash === "string"
            ? outcome.txHash
            : "",
      });
      setDismissed(true);
      setState("done");
    } else if (outcome.status === "none") {
      dropBadgeClaims(claimable);
      setDismissed(true);
      setState("idle");
    } else if (outcome.status === "rejected") {
      dropBadgeClaims(claimable);
      track("badge_claim_rejected", {
        count: claimable.length,
        surface,
        reason: "user_rejected",
      });
      setState("error");
    } else {
      dropBadgeClaims(claimable);
      track("badge_claim_failed", {
        count: claimable.length,
        surface,
        reason: outcome.why,
      });
      setFailure(outcome.why);
      setState("error");
    }
  };

  // A limit or a missing fee balance is not something "try again" fixes.
  const errorKey =
    failure === "daily_cap"
      ? "me.badges.claim.errorDailyCap"
      : failure === "no_run_token"
        ? "me.badges.claim.errorNeedsFee"
        : "me.badges.claim.error";
  const show = claimable.length > 0 && !dismissed && state !== "done";
  // Only when the player's own wallet sends the claim: otherwise the relayer
  // pays and there is nothing to quote.
  const feeLine =
    playerPays && feeUsd !== null
      ? t("me.badges.claim.fee").replace("{usd}", feeUsd.toFixed(2))
      : null;

  if (variant === "card") {
    const later = () => {
      if (state === "pending" || !address) return;
      writeLater(laterStorageKey(address, claimable));
      track("badge_claim_later", { count: claimable.length, surface });
      setDismissed(true);
    };
    const preview = claimable.slice(0, CARD_PREVIEW);
    const more = claimable.length - preview.length;
    return (
      <>
        {show && (
          <section className="w-full rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-center">
            <p className="text-sm font-bold text-zinc-900">
              {(claimable.length === 1
                ? t("home.badges.title.one")
                : t("home.badges.title")
              ).replace("{n}", String(claimable.length))}
            </p>
            <p className="mt-1 text-xs text-zinc-600">{t("home.badges.body")}</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-left">
              {preview.map((id) => (
                <BadgeRow key={id} id={id} locale={locale} className="bg-white" />
              ))}
              {more > 0 && (
                <li className="text-center text-[12px] font-semibold text-orange-700">
                  +{more}
                </li>
              )}
            </ul>
            {feeLine && <p className="mt-2 text-[12px] text-zinc-500">{feeLine}</p>}
            {state === "error" && (
              <p className="mt-2 text-xs text-red-600">{t(errorKey)}</p>
            )}
            <button
              onClick={runClaim}
              disabled={state === "pending"}
              className="mk-btn mk-btn-sm mt-3 w-full px-4 disabled:opacity-60"
            >
              {state === "pending"
                ? t("me.badges.claim.pending")
                : t("home.badges.cta")}
            </button>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs">
              <Link href="/me" className="font-medium text-orange-700 underline">
                {t("home.badges.view")}
              </Link>
              <button
                type="button"
                onClick={later}
                disabled={state === "pending"}
                className="font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-60"
              >
                {t("me.badges.claim.later")}
              </button>
            </div>
          </section>
        )}
        {state === "done" && (
          <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-3 text-sm text-white shadow-2xl">
            <span className="text-orange-300">{t("me.badges.claim.done")}</span>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {show && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => {
            if (state !== "pending") setDismissed(true);
          }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CloseButton
              onClick={() => {
                if (state !== "pending") setDismissed(true);
              }}
              className="absolute top-3 right-3"
            />
            <p className="px-8 text-center text-base font-bold text-zinc-900">
              {t("me.badges.claim.title")}
            </p>
            <p className="mt-2 text-center text-sm text-zinc-500">
              {t("me.badges.claim.body")}
            </p>
            <ul className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto text-left">
              {claimable.map((id) => (
                <BadgeRow key={id} id={id} locale={locale} className="bg-orange-50" />
              ))}
            </ul>
            {feeLine && (
              <p className="mt-3 text-center text-xs text-zinc-500">{feeLine}</p>
            )}
            {state === "error" && (
              <p className="mt-3 text-center text-xs text-red-600">
                {t(errorKey)}
              </p>
            )}
            <div className="mt-5">
              <button
                onClick={runClaim}
                disabled={state === "pending"}
                className="mk-btn w-full px-4 disabled:opacity-60"
              >
                {state === "pending"
                  ? t("me.badges.claim.pending")
                  : t("me.badges.claim.cta")}
              </button>
            </div>
          </div>
        </div>
      )}
      {state === "done" && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-3 text-sm text-white shadow-2xl">
          <span className="text-orange-700">{t("me.badges.claim.done")}</span>
        </div>
      )}
    </>
  );
}

/**
 * One badge in the claim: its art, its name and what it was earned for, so
 * the player knows what they are claiming before the wallet opens.
 */
function BadgeRow({
  id,
  locale,
  className,
}: {
  id: number;
  locale: "en" | "es";
  className: string;
}) {
  const copy = badgeCopy(id, locale);
  return (
    <li className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${className}`}>
      <span
        aria-hidden
        className="inline-block h-7 w-7 shrink-0"
        dangerouslySetInnerHTML={{ __html: badgeSvg(id, 28) }}
      />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-orange-700">{copy.name}</span>
        {copy.description && (
          <span className="block text-[12px] leading-snug text-zinc-600">
            {copy.description}
          </span>
        )}
      </span>
    </li>
  );
}

/** Badges listed on the home card before collapsing into "+N". */
const CARD_PREVIEW = 6;

/** Session key for "Later" on the home card; a new badge shows the card again. */
function laterStorageKey(address: string, ids: number[]): string {
  return `mk:badgeLater:${address.toLowerCase()}:${[...ids].sort((a, b) => a - b).join(",")}`;
}

function readLater(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeLater(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // Private mode or storage blocked: the card just comes back on reload.
  }
}
