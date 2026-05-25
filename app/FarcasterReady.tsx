"use client";

import { useEffect } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("farcaster:ready");

type IdleWindow = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Signal the Farcaster Mini App host that we have finished initial render
 * and the splash screen can dismiss. Calling this outside a Farcaster
 * context is a no-op on the SDK side, so we always call it.
 *
 * The SDK import is heavy (~80 KB gzip) and blocks the main thread during
 * parse. We push it into `requestIdleCallback` so it runs after first
 * interaction-ready, never during initial render. Falls back to a 500ms
 * `setTimeout` on browsers without rIC.
 */
export function FarcasterReady() {
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    let idleHandle: number | undefined;

    const idleWindow = window as Window & IdleWindow;

    const fire = async () => {
      if (cancelled) return;
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
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleHandle = idleWindow.requestIdleCallback(() => void fire(), {
        timeout: 2000,
      });
    } else {
      timeoutId = window.setTimeout(() => void fire(), 500);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleHandle);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);
  return null;
}
