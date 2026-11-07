"use client";

import * as Sentry from "@sentry/nextjs";
import { useCallback, useState } from "react";
import { type Address, createPublicClient, encodeFunctionData, erc20Abi, type Hex, http } from "viem";
import { useWalletClient } from "wagmi";
import { track } from "@/lib/analytics";
import { describeEntryError, entryFailureFingerprint } from "@/lib/challenges/entryFailure";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { getChain } from "@/lib/onchain/chains";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { heldFeeAdaptersForWallet } from "@/lib/wallet/feeSupport";
import { errorText, isUserRejection } from "@/lib/wallet/playerFee";
import { sendWithFeeFallback } from "@/lib/wallet/sendWithFees";
import { useBalances } from "@/lib/wallet/useBalances";

const log = createLogger("challenges:enter");

export type EnterState =
  | "idle"
  | "approving"
  | "entering"
  | "entered"
  | "rejected"
  | "no-funds"
  | "closed"
  | "error";

type EnterReply = { ok: boolean; reason?: string; txHash?: string };

/**
 * Ask the relayer to charge the entry from the allowance. `needs-approval`
 * right after an approve is the RPC lagging behind the wallet, so it retries.
 */
async function requestEntry(challengeId: string, address: Address): Promise<EnterReply & { status: number }> {
  let last: EnterReply & { status: number } = { ok: false, reason: "network", status: 0 };
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`/api/challenges/${challengeId}/enter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = (await res.json().catch(() => ({}))) as EnterReply;
      last = { ...body, status: res.status };
      if (res.ok || body.reason === "entered") return last;
      if (body.reason !== "needs-approval" && body.reason !== "in-flight" && res.status !== 502) return last;
    } catch {
      last = { ok: false, reason: "network", status: 0 };
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return last;
}

/**
 * Enter a challenge. The first time, the player approves the drops contract
 * for a bounded amount (MiniPay refuses unlimited approvals and caps them at
 * $10); that is the only transaction they sign. Every entry, that first one
 * included, is then a tap: the relayer calls `enterFor`, which takes exactly
 * the fee from the allowance and pays the gas.
 */
export function useEnterChallenge(p: {
  address: Address | null;
  challengeId: string | null;
  token: Address | null;
  amount: bigint | null;
  spender: Address | null;
  approveAmount: bigint | null;
  allowance: bigint | null;
  onEntered?: () => void;
}) {
  const { data: walletClient } = useWalletClient();
  const chainKey = useActiveChainKey();
  const balances = useBalances(p.address, !!p.address);
  const [state, setState] = useState<EnterState>("idle");

  const approve = useCallback(async (): Promise<boolean> => {
    const { address, token, spender, approveAmount, challengeId } = p;
    if (!walletClient || !address || !token || !spender || !approveAmount) return false;
    setState("approving");
    track("challenge_approve_started", { challenge: challengeId ?? "", amount: approveAmount.toString() });
    const tried: string[] = [];
    try {
      const chain = getChain(chainKey);
      const held = heldFeeAdaptersForWallet(chain.feeCurrencies, balances);
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, approveAmount] });
      Sentry.addBreadcrumb({
        category: "challenge",
        message: "approve send",
        data: { token, spender, amount: approveAmount.toString(), fees: held.map((f) => f.symbol).join(",") },
      });
      const { result: txHash } = await sendWithFeeFallback(held, (fee) => {
        tried.push(fee?.symbol ?? "CELO");
        return walletClient.sendTransaction({
          to: token,
          data: withAttribution(data),
          chain: chain.chain,
          account: address,
          kzg: undefined,
          ...(fee ? { feeCurrency: fee.adapter } : {}),
        });
      });
      track("challenge_approve_sent", { challenge: challengeId ?? "", tx_hash: txHash, fee: tried[tried.length - 1] ?? "none" });
      const pub = createPublicClient({ chain: chain.chain, transport: http() });
      const receipt = await pub.waitForTransactionReceipt({ hash: txHash as Hex, timeout: 90_000 });
      if (receipt.status !== "success") throw new Error(`approve reverted: ${txHash}`);
      track("challenge_approved", { challenge: challengeId ?? "", tx_hash: txHash });
      return true;
    } catch (e) {
      if (isUserRejection(e)) {
        track("challenge_approve_failed", { reason: "rejected", fees_tried: tried.join(",") });
        setState("rejected");
        return false;
      }
      const d = describeEntryError(e);
      const message = errorText(e).slice(0, 500);
      log.warn("challenge approve failed", { kind: d.kind, code: d.code, message });
      track("challenge_approve_failed", {
        reason: d.kind,
        message,
        code: d.code ?? undefined,
        details: d.details ?? undefined,
        error_name: d.name ?? undefined,
        fees_tried: tried.join(","),
      });
      if (d.kind !== "no_fee") {
        Sentry.captureMessage(`Challenge approve failed: ${d.kind}`, {
          level: "warning",
          tags: { flow: "challenge-enter", step: "approve", kind: d.kind, code: d.code ?? "none" },
          fingerprint: ["challenge-approve-failed", d.kind],
          extra: { ...d, message, token, spender, fees_tried: tried },
        });
      }
      setState(d.kind === "no_fee" ? "no-funds" : "error");
      return false;
    }
  }, [walletClient, chainKey, balances, p]);

  const enter = useCallback(async () => {
    const { address, challengeId, amount, allowance } = p;
    if (!address || !challengeId || !amount) return;
    const usdt = balances.USDT?.value ?? null;
    if (usdt !== null && usdt < amount) {
      track("challenge_enter_failed", { reason: "no-funds", balance: usdt.toString() });
      setState("no-funds");
      return;
    }
    track("challenge_enter_started", { challenge: challengeId, needs_approval: allowance === null || allowance < amount });
    if (allowance === null || allowance < amount) {
      if (!(await approve())) return;
    }
    setState("entering");
    const r = await requestEntry(challengeId, address);
    if (r.ok || r.reason === "entered") {
      track("challenge_entered", { challenge: challengeId, tx_hash: r.txHash ?? "", already: r.reason === "entered" });
      setState("entered");
      p.onEntered?.();
      return;
    }
    const reason = r.reason ?? "error";
    track("challenge_enter_failed", { reason, status: r.status, tx_hash: r.txHash });
    // The card's own states: the player can fix these, nothing is broken.
    const expected = reason === "no-funds" || reason === "entries-closed" || reason === "needs-approval";
    if (!expected) {
      Sentry.captureMessage(`Challenge entry relay failed: ${reason}`, {
        level: "error",
        tags: { flow: "challenge-enter", step: "relay", reason },
        fingerprint: entryFailureFingerprint(`relay-${reason}`),
        extra: { challengeId, status: r.status, txHash: r.txHash ?? null },
      });
    }
    setState(reason === "no-funds" ? "no-funds" : reason === "entries-closed" ? "closed" : "error");
  }, [approve, balances, p]);

  return { enter, state };
}
