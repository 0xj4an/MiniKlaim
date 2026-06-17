"use client";

import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { badgeCopy, badgeSvg } from "@/lib/onchain/badgeArt";
import { useClaimBadges } from "@/lib/wallet/useClaimBadges";

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
 */
export function BadgeClaimPrompt({
  address,
  enabled,
  refreshKey = 0,
  detectOnMount = true,
}: {
  address: Address | null;
  enabled: boolean;
  refreshKey?: number;
  detectOnMount?: boolean;
}) {
  const { t, locale } = useLocale();
  const { claim } = useClaimBadges(address, enabled);
  const [claimable, setClaimable] = useState<number[]>([]);
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">(
    "idle",
  );
  const [tx, setTx] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const skipNext = useRef(!detectOnMount);

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
          `/api/users/${address.toLowerCase()}/badges`,
        );
        const held = (await heldRes.json()) as {
          contract: string | null;
          heldIds: number[];
        };
        if (!held.contract) return;
        const vRes = await fetch(
          `/api/users/${address.toLowerCase()}/badges/voucher`,
          { method: "POST" },
        );
        if (vRes.status === 409) {
          if (!cancelled) setClaimable([]);
          return;
        }
        if (!vRes.ok) return;
        const voucher = (await vRes.json()) as { badgeIds: string[] };
        const heldSet = new Set(held.heldIds);
        const fresh = voucher.badgeIds
          .map(Number)
          .filter((id) => !heldSet.has(id));
        if (!cancelled && fresh.length > 0) {
          setClaimable(fresh);
          setDismissed(false);
          setState("idle");
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
  }, [address, enabled, refreshKey]);

  useEffect(() => {
    if (state !== "done") return;
    const id = window.setTimeout(() => setState("idle"), 5000);
    return () => window.clearTimeout(id);
  }, [state]);

  const runClaim = async () => {
    setState("pending");
    const outcome = await claim();
    if (outcome.status === "user-claimed") {
      setTx(outcome.txHash);
      setDismissed(true);
      setState("done");
    } else if (outcome.status === "sponsored") {
      setDismissed(true);
      setState("done");
    } else if (outcome.status === "none") {
      setDismissed(true);
      setState("idle");
    } else {
      setState("error");
    }
  };

  const show = claimable.length > 0 && !dismissed && state !== "done";

  return (
    <>
      {show && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-center text-base font-bold text-zinc-900">
              {t("me.badges.claim.title")}
            </p>
            <p className="mt-2 text-center text-sm text-zinc-500">
              {t("me.badges.claim.body")}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {claimable.map((id) => (
                <span
                  key={id}
                  className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700"
                >
                  <span
                    aria-hidden
                    className="inline-block h-4 w-4"
                    dangerouslySetInnerHTML={{ __html: badgeSvg(id, 16) }}
                  />
                  {badgeCopy(id, locale).name}
                </span>
              ))}
            </div>
            {state === "error" && (
              <p className="mt-3 text-center text-xs text-red-600">
                {t("me.badges.claim.error")}
              </p>
            )}
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={runClaim}
                disabled={state === "pending"}
                className="w-full rounded-full bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {state === "pending"
                  ? t("me.badges.claim.pending")
                  : t("me.badges.claim.cta")}
              </button>
              <button
                onClick={() => setDismissed(true)}
                disabled={state === "pending"}
                className="w-full rounded-full px-4 py-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-60"
              >
                {t("me.badges.claim.later")}
              </button>
            </div>
          </div>
        </div>
      )}
      {state === "done" && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-5 py-3 text-sm text-white shadow-2xl">
          <span className="text-orange-700">{t("me.badges.claim.done")}</span>
          {tx && (
            <>
              {" "}
              <a
                href={`https://celoscan.io/tx/${tx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs underline"
              >
                {t("me.badges.claim.viewTx")}
              </a>
            </>
          )}
        </div>
      )}
    </>
  );
}
