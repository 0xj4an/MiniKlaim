"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { useWalletClient } from "wagmi";
import { track } from "@/lib/analytics";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain } from "@/lib/onchain/chains";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { heldFeeAdaptersForWallet } from "@/lib/wallet/feeSupport";
import { errorText, isUserRejection } from "@/lib/wallet/playerFee";
import { sendWithFeeFallback } from "@/lib/wallet/sendWithFees";
import { useBalances } from "@/lib/wallet/useBalances";

const log = createLogger("challenges:enter");

export type EnterState = "idle" | "sending" | "confirming" | "entered" | "rejected" | "no-funds" | "error";

const PENDING_KEY = "mk.challenge.pendingEntry";

type Pending = { challengeId: string; txHash: Hex };

function readPending(): Pending | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

function writePending(p: Pending | null) {
  try {
    if (p) window.localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage can be off; the server sync picks the entry up anyway.
  }
}

/** Ask the server to read the entry from the chain, retrying while it is not mined. */
async function confirmEntry(challengeId: string, txHash: Hex): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`/api/challenges/${challengeId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash }),
      });
      if (res.ok) return true;
      if (res.status !== 202 && res.status !== 502) return false;
    } catch {
      // Network: retry.
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

/**
 * Pay the entry: a plain token transfer from the player to the challenge
 * deposit (the MiniKlaimDrops contract), tagged, with the network fee paid in
 * whatever the wallet holds. It is the only transaction the player signs in a
 * challenge; the prize is claimed with one tap and paid by the relayer.
 */
export function useEnterChallenge(p: {
  address: Address | null;
  challengeId: string | null;
  token: Address | null;
  amount: bigint | null;
  deposit: Address | null;
  onEntered?: () => void;
}) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(p.address, !!p.address);
  const [state, setState] = useState<EnterState>("idle");

  // A payment sent before the app closed: finish registering it.
  useEffect(() => {
    const pending = readPending();
    if (!pending || pending.challengeId !== p.challengeId) return;
    setState("confirming");
    void confirmEntry(pending.challengeId, pending.txHash).then((ok) => {
      if (ok) {
        writePending(null);
        setState("entered");
        p.onEntered?.();
      } else {
        setState("idle");
      }
    });
    // Runs once per challenge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.challengeId]);

  const enter = useCallback(async () => {
    const { address, challengeId, token, amount, deposit } = p;
    if (!walletClient || !address || !challengeId || !token || !amount || !deposit) return;
    const usdt = balances.USDT?.value ?? null;
    if (usdt !== null && usdt < amount) {
      track("challenge_enter_failed", { reason: "no-funds" });
      setState("no-funds");
      return;
    }
    setState("sending");
    track("challenge_enter_started", { challenge: challengeId });
    let txHash: Hex;
    try {
      const chain = getChain(chainKey);
      const held = heldFeeAdaptersForWallet(chain.feeCurrencies, balances);
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [deposit, amount] });
      ({ result: txHash } = await sendWithFeeFallback(held, (fee) =>
        walletClient.sendTransaction({
          to: token,
          data: withAttribution(data),
          chain: chain.chain,
          account: address,
          kzg: undefined,
          ...(fee ? { feeCurrency: fee.adapter } : {}),
        }),
      ));
    } catch (e) {
      if (isUserRejection(e)) {
        track("challenge_enter_failed", { reason: "rejected" });
        setState("rejected");
        return;
      }
      const message = errorText(e).slice(0, 200);
      log.warn("challenge entry tx failed", { message });
      track("challenge_enter_failed", { reason: "tx", message });
      setState("error");
      return;
    }
    writePending({ challengeId, txHash });
    setState("confirming");
    const ok = await confirmEntry(challengeId, txHash);
    if (ok) {
      writePending(null);
      track("challenge_entered", { challenge: challengeId, tx_hash: txHash });
      setState("entered");
      p.onEntered?.();
    } else {
      // Paid but not confirmed yet: the server sync registers it from the chain.
      track("challenge_enter_failed", { reason: "confirm", tx_hash: txHash });
      setState("error");
    }
  }, [walletClient, chainKey, balances, p]);

  return { enter, state };
}
