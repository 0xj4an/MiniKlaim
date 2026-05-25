"use client";

import { useEffect, useState } from "react";

export type WalletEnvironment =
  | "minipay" // inside MiniPay; auto-connect via injected
  | "farcaster" // inside Farcaster Mini App; auto-connect via the farcaster connector
  | "browser-wallet" // desktop or mobile with a wallet extension/in-app browser (MetaMask, Rabby, Trust, etc.)
  | "telegram-webview" // Telegram in-app browser (no wallet, no good way to inject one)
  | "mobile-no-wallet" // mobile browser without an injected provider
  | "desktop-no-wallet" // desktop browser without an injected provider
  | "unknown";

type MaybeProvider = { isMiniPay?: boolean } | undefined;

/** Synchronous env classification. Does NOT touch the Farcaster SDK. */
function detectSync(): Exclude<WalletEnvironment, "farcaster"> {
  if (typeof window === "undefined") return "unknown";

  const ethereum = (window as Window & { ethereum?: MaybeProvider }).ethereum;
  if (ethereum?.isMiniPay === true) return "minipay";

  const ua = navigator.userAgent ?? "";
  const isTelegram = /Telegram/i.test(ua) || /TG-Android|TG-iOS/i.test(ua);
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  if (ethereum) return "browser-wallet";
  if (isTelegram) return "telegram-webview";
  return isMobile ? "mobile-no-wallet" : "desktop-no-wallet";
}

/**
 * Ask the Farcaster SDK if we are running inside a Mini App host. The SDK
 * is a heavy import (~80 KB gzip) so we only do it if there is a plausible
 * hint we might be in Farcaster, and we defer it off the critical path.
 *
 * Hint: Mini App hosts typically advertise themselves through the user
 * agent (Warpcast / Coinbase Wallet) or through a `farcaster` global. We
 * try the SDK only when those signals are present.
 */
async function maybeDetectFarcaster(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  const looksFarcaster =
    /Warpcast|Farcaster/i.test(ua) ||
    typeof (window as { farcaster?: unknown }).farcaster !== "undefined";
  if (!looksFarcaster) return false;
  try {
    const mod = await import("@farcaster/miniapp-sdk");
    return await mod.sdk.isInMiniApp();
  } catch {
    return false;
  }
}

export function useWalletEnvironment(): WalletEnvironment {
  const [env, setEnv] = useState<WalletEnvironment>("unknown");
  useEffect(() => {
    let cancelled = false;
    // Resolve the cheap synchronous classification immediately so the UI
    // can stop showing the skeleton on the first paint.
    const sync = detectSync();
    queueMicrotask(() => {
      if (!cancelled) setEnv(sync);
    });

    // Only attempt the heavy Farcaster SDK probe if the sync classifier
    // didn't already lock us into MiniPay (which is the higher-priority
    // host), and there's a hint we might be in Farcaster.
    if (sync === "minipay") return;
    void (async () => {
      const isFc = await maybeDetectFarcaster();
      if (!cancelled && isFc) {
        queueMicrotask(() => setEnv("farcaster"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
  return env;
}
