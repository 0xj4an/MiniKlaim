"use client";

import { useEffect, useState } from "react";
import { useInMiniPay } from "@/lib/wallet/useInMiniPay";

/**
 * Whether this page may offer redeeming a link code. Always outside MiniPay.
 * Inside it, only once the server says MiniPay accepts the redeem transaction
 * (MINIPAY_LINK_REDEEM, see lib/link/redeemFlag). False until known, so the
 * refused path never flashes on screen.
 */
export function useLinkRedeemOffered(): boolean {
  const inMiniPay = useInMiniPay();
  const [allowedInMiniPay, setAllowedInMiniPay] = useState(false);
  useEffect(() => {
    if (!inMiniPay) return;
    let cancelled = false;
    void fetch("/api/link")
      .then((r) => (r.ok ? (r.json() as Promise<{ redeemInMiniPay?: boolean }>) : null))
      .then((body) => {
        if (!cancelled) setAllowedInMiniPay(body?.redeemInMiniPay === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inMiniPay]);
  return !inMiniPay || allowedInMiniPay;
}
