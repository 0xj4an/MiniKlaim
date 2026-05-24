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

async function detect(): Promise<WalletEnvironment> {
  if (typeof window === "undefined") return "unknown";

  const ethereum = (window as Window & { ethereum?: MaybeProvider }).ethereum;
  if (ethereum?.isMiniPay === true) return "minipay";

  // Ask the Farcaster SDK if we are running inside a Mini App host
  // (Warpcast, Coinbase Wallet's Farcaster client, dev preview tool, etc.).
  // Dynamic import so the SDK is only fetched on first mount.
  try {
    const mod = await import("@farcaster/miniapp-sdk");
    const inMiniApp = await mod.sdk.isInMiniApp();
    if (inMiniApp) return "farcaster";
  } catch {
    // SDK failed to load or threw; treat as non-farcaster.
  }

  const ua = navigator.userAgent ?? "";
  const isTelegram = /Telegram/i.test(ua) || /TG-Android|TG-iOS/i.test(ua);
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  if (ethereum) return "browser-wallet";
  if (isTelegram) return "telegram-webview";
  return isMobile ? "mobile-no-wallet" : "desktop-no-wallet";
}

export function useWalletEnvironment(): WalletEnvironment {
  const [env, setEnv] = useState<WalletEnvironment>("unknown");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await detect();
      if (!cancelled) {
        queueMicrotask(() => setEnv(next));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return env;
}
