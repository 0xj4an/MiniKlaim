"use client";

import { useCallback, useState } from "react";
import { track } from "@/lib/analytics";

export type ClaimTreasuresState = "idle" | "claiming" | "sent" | "error";

/**
 * Tap + relayer: POST tells the backend to submit the claim. The player signs
 * nothing (MiniPay cannot sign messages) and pays no network fee.
 */
export function useClaimTreasures(address: string | null, surface: "run" | "me") {
  const [state, setState] = useState<ClaimTreasuresState>("idle");

  const claim = useCallback(
    async (count: number) => {
      if (!address) return false;
      setState("claiming");
      track("drop_claim_started", { count, surface });
      try {
        const res = await fetch(`/api/users/${address}/drops`, { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          txHash?: string;
          count?: number;
          reason?: string;
        };
        if (res.ok && body.ok) {
          track("drop_claim_sent", { count: body.count ?? count, tx_hash: body.txHash ?? "" });
          setState("sent");
          return true;
        }
        // Already sent by an earlier tap: it is on its way.
        if (body.reason === "in-flight") {
          setState("sent");
          return true;
        }
        track("drop_claim_failed", { reason: body.reason ?? String(res.status) });
        setState("error");
        return false;
      } catch (e) {
        track("drop_claim_failed", { reason: e instanceof Error ? e.message.slice(0, 80) : "network" });
        setState("error");
        return false;
      }
    },
    [address, surface],
  );

  return { claim, state };
}
