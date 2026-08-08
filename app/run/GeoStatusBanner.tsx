"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { useLocale } from "@/lib/i18n";

export type GeoStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable";

/**
 * Top-of-map banner shown while geolocation is still resolving, denied, or
 * unavailable. Includes a "waiting" nudge after 8s and, on iOS + MiniPay
 * where geolocation is broken today, a "open in MetaMask" escape hatch
 * after 12s.
 *
 * Renders null once status is "granted".
 */
export function GeoStatusBanner({
  status,
  lastError,
}: {
  status: GeoStatus;
  lastError: string | null;
}) {
  const { t } = useLocale();
  const [showHelp, setShowHelp] = useState(false);
  const [showMinipayIosEscape, setShowMinipayIosEscape] = useState(false);

  // Fire denied/unavailable/minipay-ios-blocked events once per status
  // transition, not on every render. The ref survives re-renders and gets
  // reset when the user leaves and re-enters the page.
  const trackedStatusRef = useRef<GeoStatus | null>(null);
  const trackedMinipayIosRef = useRef(false);
  useEffect(() => {
    if (trackedStatusRef.current === status) return;
    trackedStatusRef.current = status;
    if (status === "denied") track("gps_denied");
    else if (status === "unavailable") track("gps_unavailable");
  }, [status]);
  useEffect(() => {
    if (!showMinipayIosEscape || trackedMinipayIosRef.current) return;
    trackedMinipayIosRef.current = true;
    track("gps_minipay_ios_blocked");
  }, [showMinipayIosEscape]);

  useEffect(() => {
    if (status !== "requesting" && status !== "idle") return;
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent ?? "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const ethereum = (window as Window & { ethereum?: { isMiniPay?: boolean } })
      .ethereum;
    const isMiniPay = ethereum?.isMiniPay === true;
    if (!isIOS || !isMiniPay) return;
    const id = window.setTimeout(() => {
      queueMicrotask(() => setShowMinipayIosEscape(true));
    }, 12000);
    return () => window.clearTimeout(id);
  }, [status]);
  useEffect(() => {
    if (status !== "requesting" && status !== "idle") {
      queueMicrotask(() => setShowHelp(false));
      return;
    }
    const id = window.setTimeout(() => {
      queueMicrotask(() => setShowHelp(true));
    }, 8000);
    return () => window.clearTimeout(id);
  }, [status]);

  if (status === "granted") return null;

  if (
    showMinipayIosEscape &&
    (status === "requesting" || status === "idle") &&
    typeof window !== "undefined"
  ) {
    const host = `${window.location.host}${window.location.pathname}`;
    const mmDeepLink = `https://metamask.app.link/dapp/${host}`;
    return (
      <div className="pointer-events-auto absolute top-16 right-4 left-4 z-10 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-center text-xs text-amber-900 shadow-md backdrop-blur">
        <p className="font-semibold">{t("run.gps.minipayIosTitle")}</p>
        <p className="text-[11px]">{t("run.gps.minipayIosBody")}</p>
        <a
          href={mmDeepLink}
          className="self-center rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700"
        >
          {t("run.gps.openInMetamask")}
        </a>
      </div>
    );
  }

  let message: string;
  let tone: string;
  switch (status) {
    case "idle":
    case "requesting":
      message = t("run.gps.waiting");
      tone = "bg-white/90 text-zinc-700";
      break;
    case "denied":
      message = t("run.gps.denied");
      tone = "border border-amber-300 bg-amber-50 text-amber-900";
      break;
    case "unavailable":
      message = t("run.gps.unavailable");
      tone = "border border-amber-300 bg-amber-50 text-amber-900";
      break;
  }
  return (
    <div
      className={`pointer-events-none absolute top-16 right-4 left-4 z-10 rounded-md p-3 text-center text-xs shadow-md backdrop-blur ${tone}`}
    >
      <div>{message}</div>
      {showHelp && (status === "requesting" || status === "idle") && (
        <div className="mt-1 text-[11px] text-zinc-600">
          {t("run.gps.waitingHelp")}
        </div>
      )}
      {lastError && (status === "requesting" || status === "idle") && (
        <div className="mt-1 font-mono text-[10px] text-zinc-500">
          {t("run.gps.lastError")}: {lastError}
        </div>
      )}
    </div>
  );
}
