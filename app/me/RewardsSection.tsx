"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useLocale } from "@/lib/i18n";
import { isRewardsConfigured } from "@/lib/onchain/rewards";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { useClaimRewards } from "@/lib/wallet/useClaimRewards";

type PendingSummary = {
  count: number;
  amountWei: bigint;
};

/**
 * Show the player's pending USDm rewards and offer a one-tap claim. Hides
 * itself entirely when the rewards contract isn't deployed yet (env var
 * `NEXT_PUBLIC_CELO_REWARDS_ADDRESS` unset). Amounts and pool health are
 * fetched from the same voucher endpoint the claim tx uses, so a stale UI
 * won't push a claim the pool can't cover.
 */
export function RewardsSection({
  address,
}: {
  address: `0x${string}` | null;
}) {
  const { t } = useLocale();
  const chainKey = useActiveChainKey();
  const { claim, state } = useClaimRewards(address);
  const [pending, setPending] = useState<PendingSummary | null>(null);
  const [reason, setReason] = useState<
    "loading" | "none" | "pool-too-low" | "not-configured" | "ready"
  >("loading");
  const [lastClaim, setLastClaim] = useState<bigint | null>(null);

  useEffect(() => {
    if (!address) return;
    if (!isRewardsConfigured(chainKey)) {
      setReason("not-configured");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/users/${address}/rewards/voucher?chain=${chainKey}`,
          { method: "POST" },
        );
        if (cancelled) return;
        if (res.status === 503) {
          setReason("not-configured");
          return;
        }
        if (res.status === 409) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            total?: string;
          };
          if (body.error === "pool-too-low") {
            setReason("pool-too-low");
            setPending({
              count: 0,
              amountWei: body.total ? BigInt(body.total) : 0n,
            });
          } else {
            setReason("none");
          }
          return;
        }
        if (!res.ok) {
          setReason("none");
          return;
        }
        const v = (await res.json()) as {
          badgeIds: string[];
          total?: string;
        };
        setPending({
          count: v.badgeIds.length,
          amountWei: v.total ? BigInt(v.total) : 0n,
        });
        setReason("ready");
      } catch {
        setReason("none");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, chainKey, lastClaim]);

  if (!address || reason === "not-configured") return null;

  async function onClaim() {
    const result = await claim();
    if (result.status === "claimed") {
      setLastClaim(result.amountWei);
      // Trigger a refresh of pending state.
      setPending(null);
      setReason("loading");
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
      <p className="text-center text-xs font-semibold text-orange-800">
        {t("me.rewards.header")}
      </p>

      {reason === "loading" && (
        <p className="text-center text-xs text-zinc-500">...</p>
      )}

      {reason === "ready" && pending && pending.count > 0 && (
        <>
          <p className="text-center text-sm text-zinc-800">
            {t("me.rewards.pending")
              .replace("{amount}", formatUsdm(pending.amountWei))
              .replace("{count}", String(pending.count))}{" "}
            {pending.count === 1
              ? t("me.rewards.pendingOne")
              : t("me.rewards.pendingMany")}
          </p>
          <button
            onClick={() => void onClaim()}
            disabled={state === "fetching-voucher" || state === "sending"}
            className="mx-auto rounded-full bg-orange-700 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
          >
            {state === "fetching-voucher" || state === "sending"
              ? t("me.rewards.claiming")
              : t("me.rewards.claim")}
          </button>
        </>
      )}

      {reason === "none" && (
        <p className="text-center text-xs text-zinc-500">
          {t("me.rewards.noPending")}
        </p>
      )}

      {reason === "pool-too-low" && (
        <p className="text-center text-xs text-zinc-500">
          {t("me.rewards.poolLow")}
        </p>
      )}

      {state === "linked" && lastClaim && (
        <p className="text-center text-xs text-green-700">
          {t("me.rewards.claimed").replace("{amount}", formatUsdm(lastClaim))}
        </p>
      )}

      {state === "error" && (
        <p className="text-center text-xs text-red-600">
          {t("me.rewards.error")}
        </p>
      )}
    </div>
  );
}

function formatUsdm(wei: bigint): string {
  const n = Number(formatUnits(wei, 18));
  if (!Number.isFinite(n)) return "0";
  if (n < 0.01) return "<0.01";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
