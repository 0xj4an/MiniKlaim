"use client";

import { useState } from "react";
import { useSignMessage } from "wagmi";
import { useLocale } from "@/lib/i18n";
import { linkChallenge } from "@/lib/linkChallenge";
import { createLogger } from "@/lib/logger";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";

const log = createLogger("ui:linkWallet");

/**
 * Link the connected wallet to an existing MiniKlaim player so identity (name,
 * profile) is shared across chains. Two paths: generate a code here to enter on
 * another wallet, or enter a code from another wallet and prove control by
 * signing the challenge.
 */
export function LinkWallet({ address }: { address: `0x${string}` | null }) {
  const { t } = useLocale();
  const chainKey = useActiveChainKey();
  const { signMessageAsync } = useSignMessage();
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [state, setState] = useState<"idle" | "linking" | "linked" | "error">(
    "idle",
  );

  if (!address) return null;

  async function generate() {
    try {
      const res = await fetch(`/api/link?chain=${chainKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const d = (await res.json()) as { code?: string };
      if (res.ok && d.code) setCode(d.code);
    } catch (e) {
      log.warn("generate code failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

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

  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <div>
        <p className="font-semibold text-zinc-900">{t("me.link.title")}</p>
        <p className="text-xs text-zinc-500">{t("me.link.desc")}</p>
      </div>

      <div className="flex flex-col gap-1">
        {code ? (
          <div className="rounded-md bg-white px-3 py-2 text-center">
            <span className="font-mono text-lg font-bold tracking-widest text-orange-700">
              {code}
            </span>
            <p className="mt-1 text-[11px] text-zinc-500">
              {t("me.link.codeHint")}
            </p>
          </div>
        ) : (
          <button
            onClick={generate}
            className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700"
          >
            {t("me.link.generate")}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">{t("me.link.enterLabel")}</label>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("me.link.placeholder")}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm uppercase"
          />
          <button
            onClick={redeem}
            disabled={state === "linking" || !input.trim()}
            className="rounded-full bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {state === "linking" ? t("me.link.linking") : t("me.link.cta")}
          </button>
        </div>
        {state === "linked" && (
          <p className="text-xs text-green-700">{t("me.link.linked")}</p>
        )}
        {state === "error" && (
          <p className="text-xs text-red-600">{t("me.link.error")}</p>
        )}
      </div>
    </div>
  );
}
