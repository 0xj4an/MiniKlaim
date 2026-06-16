"use client";

import { useCallback } from "react";
import type { Address, Hex } from "viem";
import { celo } from "viem/chains";
import { useWalletClient } from "wagmi";
import { createLogger } from "@/lib/logger";
import { HEXES_CLAIM_ABI, hexesAddress } from "@/lib/onchain/hexesAbi";
import { TOKENS } from "@/lib/tokens";
import { useBalances } from "@/lib/wallet/useBalances";

const log = createLogger("wallet:claimRun");

export type ClaimOutcome = "user-claimed" | "sponsored" | "no-hexes";

type Voucher = {
  tokenIds: string[];
  nonce: string;
  signature: Hex;
  contract: Address;
  chainId: number;
};

/**
 * Drives the post-finish on-chain mint.
 *
 * Primary path: the player submits their own `claimRun` tx (gated by a backend
 * EIP-712 voucher), which makes them the on-chain `msg.sender` so they count as
 * a unique active wallet. Gas is paid in USDm via fee abstraction when they hold
 * USDm (MiniPay), otherwise in native CELO.
 *
 * Fallback: if the player has no funds / declines / the wallet errors, the
 * backend relayer mints for them (sponsored). They still receive their NFTs.
 */
export function useClaimRun(address: `0x${string}` | null, enabled: boolean) {
  const { data: walletClient } = useWalletClient();
  const balances = useBalances(address, enabled);

  const sponsorFallback = useCallback(
    async (runId: string): Promise<ClaimOutcome> => {
      const res = await fetch(`/api/runs/${runId}/sponsor-mint`, {
        method: "POST",
      });
      if (!res.ok) {
        log.error("sponsor fallback failed", { runId, status: res.status });
      } else {
        log.info("sponsored mint done", { runId });
      }
      return "sponsored";
    },
    [],
  );

  const claim = useCallback(
    async (runId: string): Promise<ClaimOutcome> => {
      const contract = hexesAddress();
      if (!walletClient || !address || !contract) {
        log.info("no wallet/contract; using sponsor fallback", { runId });
        return sponsorFallback(runId);
      }

      // 1. Ask the backend for a voucher authorizing exactly this run's hexes.
      let voucher: Voucher;
      try {
        const res = await fetch(`/api/runs/${runId}/voucher`, {
          method: "POST",
        });
        if (res.status === 409) {
          log.info("run has no hexes", { runId });
          return "no-hexes";
        }
        if (!res.ok) throw new Error(`voucher status ${res.status}`);
        voucher = (await res.json()) as Voucher;
      } catch (e) {
        log.warn("voucher fetch failed; sponsoring", {
          runId,
          message: e instanceof Error ? e.message : String(e),
        });
        return sponsorFallback(runId);
      }

      // 2. Player submits their own claimRun tx. Pay gas in USDm if they hold
      //    it (MiniPay fee abstraction); otherwise let the wallet use CELO.
      const hasUsdm = (balances.USDm?.value ?? 0n) > 0n;
      const feeCurrency = hasUsdm ? TOKENS.USDm.feeAdapter : undefined;
      try {
        const txHash = await walletClient.writeContract({
          address: contract,
          abi: HEXES_CLAIM_ABI,
          functionName: "claimRun",
          args: [
            voucher.tokenIds.map((t) => BigInt(t)),
            BigInt(voucher.nonce),
            voucher.signature,
          ],
          chain: celo,
          account: address,
          ...(feeCurrency ? { feeCurrency } : {}),
        });
        log.info("claimRun submitted by player", { runId, txHash });
        // 3. Record the player's own mint reference.
        await fetch(`/api/runs/${runId}/claimed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash }),
        });
        return "user-claimed";
      } catch (e) {
        // Rejected / insufficient funds / unsupported -> never block the player.
        log.warn("player claim failed; sponsoring", {
          runId,
          message: e instanceof Error ? e.message : String(e),
        });
        return sponsorFallback(runId);
      }
    },
    [walletClient, address, balances.USDm, sponsorFallback],
  );

  return { claim };
}
