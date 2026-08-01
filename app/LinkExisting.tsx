"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useLocale } from "@/lib/i18n";
import { useLinkRedeem } from "@/lib/wallet/useLinkRedeem";

/**
 * Onboarding-facing "I already have a MiniKlaim account" path: enter a code
 * generated on another wallet and prove control of this wallet by broadcasting
 * a small ownership tx (works in MiniPay, Farcaster, Startale, browser wallets
 * uniformly since MiniPay does not support `personal_sign`).
 */
export function LinkExisting() {
  const { address } = useAccount();
  const { t } = useLocale();
  const { redeem, state } = useLinkRedeem(address ?? null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (state === "linked") {
      const t = window.setTimeout(() => window.location.reload(), 1500);
      return () => window.clearTimeout(t);
    }
  }, [state]);

  if (!address) return null;

  const busy = state === "sending" || state === "confirming";

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
          onClick={() => void redeem(input)}
          disabled={busy || !input.trim()}
          className="rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {state === "sending"
            ? t("me.link.sending")
            : state === "confirming"
              ? t("me.link.confirming")
              : t("me.link.cta")}
        </button>
      </div>
      {state === "idle" && (
        <p className="text-[11px] text-zinc-400">{t("link.txNote")}</p>
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
