"use client";

import { useCallback } from "react";
import type { Address, Hex } from "viem";
import { useWalletClient } from "wagmi";
import { createLogger } from "@/lib/logger";
import { getChain } from "@/lib/onchain/chains";
import { HEXES_CLAIM_ABI, hexesAddress } from "@/lib/onchain/hexesAbi";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
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
 * Drives the post-finish on-chain hex mint on the active chain (Celo via
 * MiniPay/Farcaster, Soneium via Startale). Player submits their own `claimRun`
 * tx (gated by a backend EIP-712 voucher for that chain) so they are the
 * on-chain msg.sender; falls back to the sponsored relayer on failure. Gas is
 * paid in USDm via fee abstraction only on chains that support it (Celo).
 */
export function useClaimRun(address: `0x${string}` | null, enabled: boolean) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, enabled);

  const sponsorFallback = useCallback(
    async (runId: string): Promise<ClaimOutcome> => {
      const res = await fetch(
        `/api/runs/${runId}/sponsor-mint?chain=${chainKey}`,
        { method: "POST" },
      );
      if (!res.ok) {
        log.error("sponsor fallback failed", { runId, status: res.status });
      } else {
        log.info("sponsored mint done", { runId });
      }
      return "sponsored";
    },
    [chainKey],
  );

  const claim = useCallback(
    async (runId: string): Promise<ClaimOutcome> => {
      const chain = getChain(chainKey);
      const contract = hexesAddress(chainKey);
      if (!walletClient || !address || !contract) {
        log.info("no wallet/contract; using sponsor fallback", { runId });
        return sponsorFallback(runId);
      }

      let voucher: Voucher;
      try {
        const res = await fetch(`/api/runs/${runId}/voucher?chain=${chainKey}`, {
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

      // Fee abstraction only where supported (Celo CIP-64 + USDm held).
      const hasUsdm = (balances.USDm?.value ?? 0n) > 0n;
      const feeCurrency =
        chain.feeCurrency && hasUsdm ? chain.feeCurrency : undefined;
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
          chain: chain.chain,
          account: address,
          ...(feeCurrency ? { feeCurrency } : {}),
        });
        log.info("claimRun submitted by player", { runId, chainKey, txHash });
        await fetch(`/api/runs/${runId}/claimed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash }),
        });
        return "user-claimed";
      } catch (e) {
        log.warn("player claim failed; sponsoring", {
          runId,
          message: e instanceof Error ? e.message : String(e),
        });
        return sponsorFallback(runId);
      }
    },
    [walletClient, address, chainKey, balances.USDm, sponsorFallback],
  );

  return { claim };
}
