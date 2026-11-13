"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";
import { createLogger } from "@/lib/logger";
import { useActiveChainKey } from "@/lib/onchain/useActiveChain";
import { useLinkRedeem } from "@/lib/wallet/useLinkRedeem";
import { forgetOwnerKey, ownerKeyHeaders } from "@/lib/wallet/ownerKey";

const log = createLogger("ui:linkWallet");

/**
 * Link the connected wallet to an existing MiniKlaim player so identity (name,
 * profile) is shared across chains. Two paths: generate a code here to enter on
 * another wallet, or enter a code from another wallet and prove control by
 * broadcasting an ownership tx (MiniPay-safe, no `personal_sign`).
 */
export function LinkWallet({ address }: { address: `0x${string}` | null }) {
  const { t } = useLocale();
  const chainKey = useActiveChainKey();
  const { redeem, state } = useLinkRedeem(address);
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [proofNeeded, setProofNeeded] = useState(false);

  useEffect(() => {
    if (state === "linked") {
      const timer = window.setTimeout(() => window.location.reload(), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [state]);

  // Count that the panel was actually in front of someone. Without this, zero
  // codes generated is unreadable: it could mean nobody wants to link, or it
  // could mean nobody ever got here. On 31 Oct the zero was read as the first
  // and it was never evidence for either (P67, P88).
  const seen = address !== null;
  useEffect(() => {
    if (seen) track("link_prompt_shown", {});
  }, [seen]);

  if (!address) return null;

  const busy = state === "sending" || state === "confirming";

  async function generate() {
    try {
      const owner = address as string;
      const send = async () =>
        fetch(`/api/link?chain=${chainKey}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await ownerKeyHeaders(owner)),
          },
          body: JSON.stringify({ address: owner }),
        });
      let res = await send();
      if (res.status === 403) {
        // The key on this phone may have been replaced from another one.
        forgetOwnerKey(owner);
        res = await send();
      }
      if (res.status === 403) {
        setProofNeeded(true);
        track("link_code_refused", { chain: chainKey });
        return;
      }
      const d = (await res.json()) as { code?: string };
      if (res.ok && d.code) {
        setProofNeeded(false);
        setCode(d.code);
        track("link_code_generated", { chain: chainKey });
      }
    } catch (e) {
      log.warn("generate code failed", {
        message: e instanceof Error ? e.message : String(e),
      });
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
        ) : proofNeeded ? (
          <p className="text-xs text-red-600">{t("me.link.proofNeeded")}</p>
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
        <label className="text-xs text-zinc-500">
          {t("me.link.enterLabel")}
        </label>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("me.link.placeholder")}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm uppercase"
          />
          <button
            onClick={() => void redeem(input)}
            disabled={busy || !input.trim()}
            className="rounded-full bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {state === "sending"
              ? t("me.link.sending")
              : state === "confirming"
                ? t("me.link.confirming")
                : t("me.link.cta")}
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
