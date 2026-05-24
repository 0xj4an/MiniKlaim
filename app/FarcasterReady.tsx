"use client";

import { useEffect } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("farcaster:ready");

/**
 * Signal the Farcaster Mini App host that we have finished initial render
 * and the splash screen can dismiss. Calling this outside a Farcaster
 * context is a no-op on the SDK side, so we always call it.
 */
export function FarcasterReady() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mod = await import("@farcaster/miniapp-sdk");
        if (cancelled) return;
        await mod.sdk.actions.ready();
        log.info("farcaster sdk ready signaled");
      } catch (e) {
        log.warn("farcaster sdk ready failed", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
