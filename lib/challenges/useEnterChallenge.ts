"use client";

import { useCallback, useEffect, useState } from "react";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import * as Sentry from "@sentry/nextjs";
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

type Confirm = { ok: boolean; reason: string | null; status: number | null; attempts: number };

/** Ask the server to read the entry from the chain, retrying while it is not mined. */
async function confirmEntry(challengeId: string, txHash: Hex): Promise<Confirm> {
  let last: Confirm = { ok: false, reason: "network", status: null, attempts: 0 };
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`/api/challenges/${challengeId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash }),
      });
      const body = (await res.json().catch(() => ({}))) as { reason?: string };
      last = { ok: res.ok, reason: body.reason ?? null, status: res.status, attempts: i + 1 };
      if (res.ok) return last;
      if (res.status !== 202 && res.status !== 502) return last;
    } catch {
      last = { ...last, reason: "network", attempts: i + 1 };
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { ...last, reason: last.reason ?? "timeout" };
}

/**
 * A paid entry the server did not register. Money left the wallet, so this
 * always reaches Sentry as an error; the sync job is the safety net.
 */
function reportUnconfirmed(challengeId: string, txHash: Hex, c: Confirm) {
  track("challenge_enter_failed", {
    reason: "confirm",
    tx_hash: txHash,
    server_reason: c.reason ?? undefined,
    status: c.status ?? undefined,
  });
  Sentry.captureMessage("Challenge entry paid but not registered", {
    level: "error",
    tags: { flow: "challenge-enter", step: "confirm", server_reason: c.reason ?? "none" },
    fingerprint: ["challenge-enter-unconfirmed", c.reason ?? "none"],
    extra: { challengeId, txHash, ...c },
  });
}

/**
 * Pay the entry: a plain token transfer from the player to the challenge
 * deposit wallet (see challengeDepositAddress), tagged, with the network fee paid in
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
    void confirmEntry(pending.challengeId, pending.txHash).then((c) => {
      if (c.ok) {
        writePending(null);
        track("challenge_entered", { challenge: pending.challengeId, tx_hash: pending.txHash, resumed: true });
        setState("entered");
        p.onEntered?.();
      } else {
        reportUnconfirmed(pending.challengeId, pending.txHash, c);
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
      track("challenge_enter_failed", { reason: "no-funds", balance: usdt.toString() });
      setState("no-funds");
      return;
    }
    setState("sending");
    track("challenge_enter_started", { challenge: challengeId });
    let txHash: Hex;
    const tried: string[] = [];
    try {
      const chain = getChain(chainKey);
      const held = heldFeeAdaptersForWallet(chain.feeCurrencies, balances);
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [deposit, amount] });
      Sentry.addBreadcrumb({
        category: "challenge",
        message: "entry send",
        data: { challengeId, token, deposit, amount: amount.toString(), fees: held.map((f) => f.symbol).join(",") },
      });
      ({ result: txHash } = await sendWithFeeFallback(held, (fee) => {
        tried.push(fee?.symbol ?? "CELO");
        return walletClient.sendTransaction({
          to: token,
          data: withAttribution(data),
          chain: chain.chain,
          account: address,
          kzg: undefined,
          ...(fee ? { feeCurrency: fee.adapter } : {}),
        });
      }));
    } catch (e) {
      if (isUserRejection(e)) {
        track("challenge_enter_failed", { reason: "rejected", fees_tried: tried.join(",") });
        setState("rejected");
        return;
      }
      const d = describeEntryError(e);
      const message = errorText(e).slice(0, 500);
      log.warn("challenge entry tx failed", { kind: d.kind, code: d.code, message });
      track("challenge_enter_failed", {
        reason: d.kind === "tx" ? "tx" : d.kind,
        message,
        code: d.code ?? undefined,
        details: d.details ?? undefined,
        error_name: d.name ?? undefined,
        fees_tried: tried.join(","),
      });
      if (d.kind !== "no_fee") {
        Sentry.captureMessage(`Challenge entry failed: ${d.kind}`, {
          level: "warning",
          tags: { flow: "challenge-enter", step: "send", kind: d.kind, code: d.code ?? "none" },
          fingerprint: entryFailureFingerprint(d.kind),
          extra: { ...d, message, challengeId, token, deposit, fees_tried: tried },
        });
      }
      setState("error");
      return;
    }
    writePending({ challengeId, txHash });
    setState("confirming");
    track("challenge_enter_sent", { challenge: challengeId, tx_hash: txHash, fee: tried[tried.length - 1] ?? "none" });
    const c = await confirmEntry(challengeId, txHash);
    if (c.ok) {
      writePending(null);
      track("challenge_entered", { challenge: challengeId, tx_hash: txHash });
      setState("entered");
      p.onEntered?.();
    } else {
      // Paid but not confirmed yet: the server sync registers it from the chain.
      reportUnconfirmed(challengeId, txHash, c);
      setState("error");
    }
  }, [walletClient, chainKey, balances, p]);

  return { enter, state };
}
