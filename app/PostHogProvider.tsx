"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  capturePageview,
  identify,
  initAnalytics,
  resetIdentity,
} from "@/lib/analytics";
import { isMiniPay } from "@/lib/minipay";

/**
 * Mounts the analytics client and keeps identity + pageviews in sync with the
 * router and wallet state. Placed inside <Providers> so wagmi hooks are
 * available. Renders nothing.
 *
 * Pageviews are captured manually because App Router client-side navigations
 * don't emit popstate, so posthog-js's built-in history-change hook misses
 * them.
 */
export function PostHogProvider() {
  useEffect(() => {
    initAnalytics();
  }, []);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  useEffect(() => {
    if (!isConnected || !address) {
      resetIdentity();
      return;
    }
    identify(address, { env: detectEnv(), chain_id: chainId });
  }, [address, isConnected, chainId]);

  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}

// Split out so useSearchParams is inside a Suspense boundary, per Next.js
// App Router rules (otherwise the whole tree becomes dynamic).
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!pathname) return;
    const qs = searchParams?.toString();
    capturePageview(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchParams]);
  return null;
}

function detectEnv():
  | "minipay"
  | "farcaster"
  | "metamask"
  | "browser"
  | "other" {
  if (typeof window === "undefined") return "other";
  if (isMiniPay()) return "minipay";
  const w = window as unknown as {
    ethereum?: { isMetaMask?: boolean };
    farcaster?: unknown;
  };
  if (w.farcaster) return "farcaster";
  if (w.ethereum?.isMetaMask) return "metamask";
  return "browser";
}
