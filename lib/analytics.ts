"use client";

import posthog, { type PostHog } from "posthog-js";
import { clientWalletHost } from "@/lib/client/walletHost";
import { isBrowserNoise } from "@/lib/errors/browserNoise";
import { createLogger } from "@/lib/logger";

const log = createLogger("analytics");

// Typed event catalog. Adding a new event = adding an entry here. Everything
// in the app that fires analytics goes through track(), so the union is the
// source of truth for what shows up in PostHog. Property naming: snake_case,
// noun-first, past tense verb ("run_finished" not "finish_run"), booleans
// prefixed with is_/has_. Keep property sets small (<10) and avoid PII.
type EventMap = {
  // Auth / onboarding.
  wallet_connected: {
    env: "minipay" | "farcaster" | "metamask" | "browser" | "other";
    chain_id: number;
    is_first_time: boolean;
  };
  wallet_disconnected: Record<string, never>;
  wrong_chain_detected: { current_chain_id: number; expected_chain_id: number };
  username_picked: { length: number; is_first_time: boolean };
  username_changed: { length: number };
  wallet_linked: { linked_chain_id: number };
  // Onboarding is a single static 3-step card, so there is nothing to page
  // through. Only fire on dismiss with the exit path so we can tell engaged
  // users (tapped the CTA) from disengaged (clicked the backdrop).
  onboarding_completed: { via: "cta" | "backdrop" };

  // Run lifecycle.
  run_started: Record<string, never>;
  run_finished: {
    duration_sec: number;
    blocks: number;
    distance_m: number;
    speed_kmh: number;
  };
  run_capture_milestone: { hex_count: number };

  // Combined single-approval run settlement (MiniKlaimClaimRouter).
  // A decline is `run_claim_rejected` and is not sponsored in that moment.
  // `run_claim_sponsored` is no balance, a voucher failure, or another tx
  // error. The retry cron still mints runs left unminted.
  run_claim_started: { path: "router" | "two_tx" };
  // The voucher endpoint answered non-OK. `status` separates "nothing to
  // settle" (409) from "router not configured" (503) from a server fault.
  run_claim_voucher_failed: { status: number; reason: string };
  run_claim_nothing: Record<string, never>;
  run_claim_submitted: {
    hex_count: number;
    badge_count: number;
    tx_hash: string;
    fee_currency: boolean;
  };
  // The wallet or its provider refused the transaction. `reason` carries the
  // provider's own message, which is the only way to see a method the host
  // wallet declines to sign.
  run_claim_rejected: {
    hex_count: number;
    badge_count: number;
    reason: string;
  };
  run_claim_sponsored: { had_badges: boolean; trigger: string };
  run_claim_failed: { trigger: string };

  // Badges.
  badge_unlocked: { badge_id: number; badge_name: string };
  badge_claim_started: { count: number };
  badge_claim_confirmed: { count: number; tx_hash: string };
  badge_claim_failed: { count: number; reason: string };

  // Network & error tracking.
  app_crash: { error: string; digest: string; stack: string };
  hexes_refresh_error: { status: number };
  hexes_refresh_network_error: { error: string };
  batch_claim_error: { status: number; count: number };
  batch_claim_network_error: { count: number; error: string };
  run_start_error: { status: number };
  run_start_network_error: { error: string };
  run_finish_error: { status: number };
  run_finish_network_error: { error: string };
  blocks_captured: { count: number };

  // Rewards.
  reward_claim_started: { amount_usdm: string; badge_count: number };
  reward_claim_confirmed: { amount_usdm: string; tx_hash: string };
  reward_claim_failed: { reason: string };

  // Friction / errors that gate the golden path.
  gps_denied: Record<string, never>;
  gps_unavailable: Record<string, never>;
  gps_minipay_ios_blocked: Record<string, never>;
  // Fired on a 1-in-20 sample when a GPS fix is dropped because accuracy
  // exceeds the capture threshold. Sampled to avoid drowning the event
  // stream in a bad-signal urban canyon or an indoor session.
  gps_low_accuracy_dropped: { accuracy: number };
  // Fired when the client refuses to interpolate hexes between the previous
  // GPS fix and the current one because the gap is too long (>10s since last
  // fix) or the tab returned from a hidden state. Trigger tells which guard
  // fired; gap_seconds and segment_distance_m size the "how much did the
  // runner miss?" question. Data feeds the decision on whether to add a
  // routing service (Mapbox/OSRM/Google Directions) for gap recovery.
  gps_gap_detected: {
    trigger: "time" | "visibility";
    gap_seconds: number;
    segment_distance_m: number;
  };
  wallet_missing: { env: string };
  sponsor_mint_failed: { reason: string };

  // Misc.
  locale_toggled: { from: "en" | "es"; to: "en" | "es" };
  share_button_pressed: { surface: "run_summary" | "profile" };
};

type EventName = keyof EventMap;

let initialized = false;

/**
 * One-time init on the client. Called from PostHogProvider on mount. Safe to
 * call more than once (guarded). Server renders are no-ops because posthog-js
 * gates itself on `typeof window`.
 */
export function initAnalytics(): PostHog | null {
  if (initialized) return posthog;
  if (typeof window === "undefined") return null;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    log.warn("NEXT_PUBLIC_POSTHOG_KEY not set; analytics disabled");
    return null;
  }
  posthog.init(key, {
    // Route through our /ingest proxy (see next.config.ts rewrites) so the
    // requests look same-origin. MiniPay's WebView and mobile ad blockers
    // otherwise silently drop calls to us.i.posthog.com.
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    // Full autocapture is intentional: MiniKlaim has no PII inputs (username
    // is public by design, wallet address is the identity), so blanket capture
    // gives us a rich free layer without extra work.
    autocapture: true,
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_performance: true,
    // Global window.onerror + unhandledrejection hooks. Errors show up as
    // $exception events in PostHog with stack traces (grouped by fingerprint).
    // Cheaper than wiring a full Sentry SDK, sufficient for a hobby MVP.
    capture_exceptions: true,
    before_send: (event) => {
      if (!event || event.event !== "$exception") return event;
      const props = event.properties ?? {};
      const parts: string[] = [];
      const values = props.$exception_values;
      if (Array.isArray(values)) {
        for (const value of values) {
          if (typeof value === "string") parts.push(value);
        }
      } else if (typeof values === "string") {
        parts.push(values);
      }
      const list = props.$exception_list;
      if (Array.isArray(list)) {
        for (const item of list) {
          if (
            item &&
            typeof item === "object" &&
            "value" in item &&
            typeof item.value === "string"
          ) {
            parts.push(item.value);
          }
        }
      }
      if (parts.some((part) => isBrowserNoise(part))) return null;
      return event;
    },
    // Session replay for MiniPay debugging. Masks by default: no text inside
    // form inputs, no textarea content, no <img> pixels. Wallet addresses in
    // rendered spans stay visible on purpose (they are already public).
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
    },
    disable_session_recording: false,
    persistence: "localStorage+cookie",
    loaded: (ph) => {
      if (process.env.NODE_ENV !== "production") ph.debug(false);
      // Direct land on /run: this callback runs after init, which is later
      // than the pageview effect, so the pause has to happen here too.
      if (window.location.pathname === "/run") ph.stopSessionRecording();
    },
  });
  initialized = true;
  syncClientContext();
  log.info("posthog initialized", { host: "/ingest" });
  return posthog;
}

// Super properties ride on $exception too. Refresh on navigation: the host
// provider can appear after the first init.
export function syncClientContext(): void {
  if (!initialized || typeof window === "undefined") return;
  posthog.register({
    wallet_host: clientWalletHost(),
    pathname: window.location.pathname,
  });
}

/**
 * Fire a typed event. Silently no-ops if analytics never initialized (e.g. env
 * key missing) so feature code can call track() unconditionally.
 */
export function track<E extends EventName>(
  event: E,
  properties?: EventMap[E],
): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}

/**
 * Bind the current PostHog session to a wallet address. Called on every
 * successful wallet connection. Wallet address is our stable user identifier;
 * anonymous events fired before this get merged onto the user timeline via
 * PostHog's alias handling.
 */
export function identify(
  address: `0x${string}`,
  props?: { env?: string; chain_id?: number; has_username?: boolean },
): void {
  if (!initialized) return;
  posthog.identify(address.toLowerCase(), props);
}

/** Clear identity on disconnect so subsequent events are anonymous again. */
export function resetIdentity(): void {
  if (!initialized) return;
  posthog.reset();
}

/**
 * Manual pageview capture. App Router's client-side navigations don't emit
 * popstate, so posthog-js's built-in history-change tracking misses them.
 * The provider calls this on every pathname/searchParams change.
 */
export function capturePageview(url: string): void {
  if (!initialized) return;
  posthog.capture("$pageview", { $current_url: url });
}

/**
 * Replay stays on for the rest of the app. The run screen pauses it: the
 * page is a live map, and a recording of that walk is uplink on cellular
 * for no debugging value (the canvas itself is not captured).
 */
export function syncSessionRecording(pathname: string): void {
  if (!initialized) return;
  if (pathname === "/run") posthog.stopSessionRecording();
  else posthog.startSessionRecording();
}

/**
 * Add or update properties on the current user without a new event. Used for
 * post-connect enrichment (username picked, wallet linked, etc.).
 */
export function setUserProps(props: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.setPersonProperties(props);
}
