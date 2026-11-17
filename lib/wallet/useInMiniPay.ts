"use client";

import { useEffect, useState } from "react";
import { isMiniPay } from "@/lib/minipay";

/**
 * Whether the page runs inside MiniPay. False on the server and on the first
 * render, then the real answer, so server and client markup agree.
 */
export function useInMiniPay(): boolean {
  const [inMiniPay, setInMiniPay] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const detected = isMiniPay();
      if (!cancelled) setInMiniPay(detected);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return inMiniPay;
}
