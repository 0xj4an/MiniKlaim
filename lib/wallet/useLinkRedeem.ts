"use client";

import { useCallback, useState } from "react";
import {
  createPublicClient,
  http,
  keccak256,
  toBytes,
  type Hex,
} from "viem";
import { useWalletClient } from "wagmi";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain, pickFeeAdapter } from "@/lib/onchain/chains";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { useBalances } from "@/lib/wallet/useBalances";

const log = createLogger("wallet:linkRedeem");

export type LinkRedeemState =
  | "idle"
  | "sending"
  | "confirming"
  | "linked"
  | "error";

/**
 * Redeem a link code from the current wallet by sending a 0-value tx to the
 * chain's link-verifier address with `keccak256(code)` as calldata. Backend
 * reads the tx receipt to derive the redeemer and links it to the code's
 * player. Works uniformly in MiniPay, Farcaster, Startale and browser wallets
 * (MiniPay does not support `personal_sign` but supports sending txs).
 *
 * Gas is paid via USDm fee abstraction on Celo when the player holds USDm;
 * otherwise the wallet pays in the native currency.
 */
export function useLinkRedeem(address: `0x${string}` | null) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(address, !!address);
  const [state, setState] = useState<LinkRedeemState>("idle");

  const redeem = useCallback(
    async (rawCode: string): Promise<boolean> => {
      const code = rawCode.trim().toUpperCase();
      if (!code || !walletClient || !address) {
        setState("error");
        return false;
      }
      const chain = getChain(chainKey);
      const codeHash = keccak256(toBytes(code));
      const feeCurrency = pickFeeAdapter(chain.feeCurrencies, balances);

      setState("sending");
      let txHash: Hex;
      try {
        txHash = await walletClient.sendTransaction({
          account: address,
          to: chain.linkVerifier,
          value: 0n,
          data: withAttribution(codeHash),
          chain: chain.chain,
          kzg: undefined,
          ...(feeCurrency ? { feeCurrency } : {}),
        });
        log.info("link tx submitted", { chainKey, txHash });
      } catch (e) {
        log.warn("link tx rejected", {
          message: e instanceof Error ? e.message : String(e),
        });
        setState("error");
        return false;
      }

      setState("confirming");
      try {
        const pub = createPublicClient({
          chain: chain.chain,
          transport: http(),
        });
        await pub.waitForTransactionReceipt({ hash: txHash });
      } catch (e) {
        log.warn("wait for receipt failed", {
          txHash,
          message: e instanceof Error ? e.message : String(e),
        });
        // Fall through: backend polling may still succeed once the receipt
        // propagates. Post anyway and let the backend decide.
      }

      try {
        const res = await fetch(`/api/link/redeem?chain=${chainKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, txHash }),
        });
        if (res.ok) {
          setState("linked");
          return true;
        }
        log.warn("redeem POST failed", {
          status: res.status,
          txHash,
        });
        setState("error");
        return false;
      } catch (e) {
        log.warn("redeem POST threw", {
          txHash,
          message: e instanceof Error ? e.message : String(e),
        });
        setState("error");
        return false;
      }
    },
    // Individual balance fields are memoized in useBalances; listing them
    // keeps the callback stable (the whole `balances` object is re-created
    // every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      walletClient,
      address,
      chainKey,
      balances.USDm,
      balances.USDC,
      balances.USDT,
    ],
  );

  return { redeem, state };
}
