"use client";

import { useCallback, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import { track } from "@/lib/analytics";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain } from "@/lib/onchain/chains";
import { nativeOnlyHeaders, shortfallHeaders } from "@/lib/onchain/sponsorHeaders";
import { heldFeeAdaptersForWallet, walletPaysGasInToken } from "@/lib/wallet/feeSupport";
import { isUserRejection, playerHasNoFeeBalance } from "@/lib/wallet/playerFee";
import { sendWithFeeFallback } from "@/lib/wallet/sendWithFees";
import { useBalances } from "@/lib/wallet/useBalances";

const log = createLogger("drops:claim");

export type ClaimTreasuresState = "idle" | "claiming" | "sent" | "rejected" | "error";

/** Same signature as the contract's; the voucher comes from the server. */
const CLAIM_ABI = [
  {
    type: "function",
    name: "claimDropsFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "player", type: "address" },
      { name: "dropIds", type: "uint256[]" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "sig", type: "bytes" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type Voucher = {
  contract: Address;
  dropIds: string[];
  nonce: string;
  deadline: string;
  signature: Hex;
};

/**
 * Claim won treasures and challenge prizes. The player pays the network fee
 * when they hold enough to; otherwise, or when their own send fails for any
 * reason but a decline, the relayer submits the claim. Prizes go to the
 * player's address either way.
 */
export function useClaimTreasures(address: string | null, surface: "run" | "me" | "challenge") {
  const [state, setState] = useState<ClaimTreasuresState>("idle");
  const { data: walletClient } = useWalletClient();
  const balances = useBalances((address as Address) ?? null, !!address);

  const relayer = useCallback(
    async (addr: string, count: number, shortfall: boolean) => {
      const res = await fetch(`/api/users/${addr}/drops`, {
        method: "POST",
        headers: {
          ...shortfallHeaders(shortfall),
          ...nativeOnlyHeaders(!walletPaysGasInToken()),
        },
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        txHash?: string;
        count?: number;
        reason?: string;
      };
      if (res.ok && body.ok) {
        track("drop_claim_sent", { count: body.count ?? count, tx_hash: body.txHash ?? "", by: "relayer" });
        return true;
      }
      // Already sent by an earlier tap: it is on its way.
      if (body.reason === "in-flight") return true;
      track("drop_claim_failed", { reason: body.reason ?? String(res.status), by: "relayer" });
      return false;
    },
    [],
  );

  const claim = useCallback(
    async (count: number) => {
      if (!address) return false;
      const addr = address.toLowerCase();
      setState("claiming");
      track("drop_claim_started", { count, surface });
      try {
        const chain = getChain("celo");
        const held = heldFeeAdaptersForWallet(chain.feeCurrencies, balances);
        const cannotPay =
          !walletClient ||
          playerHasNoFeeBalance(chain.feeCurrencies.length, held.length, balances);
        if (cannotPay) {
          const ok = await relayer(addr, count, false);
          setState(ok ? "sent" : "error");
          return ok;
        }

        const vr = await fetch(`/api/users/${addr}/drops/voucher`, { method: "POST" });
        if (vr.status === 409) {
          const b = (await vr.json().catch(() => ({}))) as { reason?: string };
          // In flight: an earlier tap already sent it.
          setState(b.reason === "in-flight" ? "sent" : "error");
          return b.reason === "in-flight";
        }
        if (!vr.ok) {
          const ok = await relayer(addr, count, false);
          setState(ok ? "sent" : "error");
          return ok;
        }
        const v = (await vr.json()) as Voucher;
        const data = encodeFunctionData({
          abi: CLAIM_ABI,
          functionName: "claimDropsFor",
          args: [
            addr as Address,
            v.dropIds.map((d) => BigInt(d)),
            BigInt(v.nonce),
            BigInt(v.deadline),
            v.signature,
          ],
        });
        try {
          const { result: txHash } = await sendWithFeeFallback(held, (fee) =>
            walletClient.sendTransaction({
              to: v.contract,
              data: withAttribution(data),
              chain: chain.chain,
              account: addr as Address,
              kzg: undefined,
              ...(fee ? { feeCurrency: fee.adapter } : {}),
            }),
          );
          await fetch(`/api/users/${addr}/drops/voucher`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ nonce: v.nonce, txHash }),
          }).catch(() => undefined);
          track("drop_claim_sent", { count, tx_hash: txHash, by: "player" });
          setState("sent");
          return true;
        } catch (e) {
          if (isUserRejection(e)) {
            track("drop_claim_rejected", { count });
            setState("rejected");
            return false;
          }
          log.warn("player treasure claim failed; relayer claims", {
            message: e instanceof Error ? e.message.slice(0, 200) : String(e),
          });
          const ok = await relayer(addr, count, true);
          setState(ok ? "sent" : "error");
          return ok;
        }
      } catch (e) {
        track("drop_claim_failed", { reason: e instanceof Error ? e.message.slice(0, 80) : "network" });
        setState("error");
        return false;
      }
    },
    // Balance fields are memoized in useBalances; the object is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, surface, walletClient, relayer, balances.USDm, balances.USDC, balances.USDT, balances.isLoading, balances.isError],
  );

  return { claim, state };
}
