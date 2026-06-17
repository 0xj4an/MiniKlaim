"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useLocale } from "@/lib/i18n";
import { linkChallenge } from "@/lib/linkChallenge";
import { createLogger } from "@/lib/logger";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";

const log = createLogger("ui:linkExisting");

/**
 * Onboarding-facing "I already have a MiniKlaim account" path: enter a code
 * generated on another wallet and sign to link this wallet to that player,
 * inheriting its identity (name). Shown at the home/name step so a new wallet
 * (e.g. a Soneium smart account in Startale) can join an existing account
 * instead of creating a duplicate.
 */
export function LinkExisting() {
  const { address } = useAccount();
  const { t } = useLocale();
  const chainKey = useActiveChainKey();
  const { signMessageAsync } = useSignMessage();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [state, setState] = useState<"idle" | "linking" | "linked" | "error">(
    "idle",
  );

  if (!address) return null;

  async function redeem() {
    const c = input.trim().toUpperCase();
    if (!c || !address) return;
    setState("linking");
    try {
      const signature = await signMessageAsync({
        account: address,
        message: linkChallenge(c),
      });
      const res = await fetch(`/api/link/redeem?chain=${chainKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, address, signature }),
      });
      if (res.ok) {
        setState("linked");
        window.setTimeout(() => window.location.reload(), 1500);
      } else {
        setState("error");
      }
    } catch (e) {
      log.warn("redeem failed", {
        message: e instanceof Error ? e.message : String(e),
      });
      setState("error");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-zinc-500 underline hover:text-zinc-800"
      >
        {t("link.haveAccount")}
      </button>
    );
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs leading-snug text-zinc-600">{t("link.steps")}</p>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("me.link.placeholder")}
          className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-center font-mono text-sm uppercase"
        />
        <button
          onClick={redeem}
          disabled={state === "linking" || !input.trim()}
          className="rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {state === "linking" ? t("me.link.linking") : t("me.link.cta")}
        </button>
      </div>
      {state === "idle" && (
        <p className="text-[11px] text-zinc-400">{t("link.signNote")}</p>
      )}
      {state === "linked" && (
        <p className="text-xs text-green-700">{t("me.link.linked")}</p>
      )}
      {state === "error" && (
        <p className="text-xs text-red-600">{t("me.link.error")}</p>
      )}
    </div>
  );
}
