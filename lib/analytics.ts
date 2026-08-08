"use client";

import posthog, { type PostHog } from "posthog-js";
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
  onboarding_step: { step_index: 1 | 2 | 3 };
  onboarding_completed: Record<string, never>;

  // Run lifecycle.
  run_started: Record<string, never>;
  run_finished: {
    duration_sec: number;
    blocks: number;
    distance_m: number;
    speed_kmh: number;
  };
  run_capture_milestone: { hex_count: number };

  // Badges.
  badge_unlocked: { badge_id: number; badge_name: string };
  badge_claim_started: { count: number };
  badge_claim_confirmed: { count: number; tx_hash: string };
  badge_claim_failed: { count: number; reason: string };

  // Rewards.
  reward_claim_started: { amount_usdm: string; badge_count: number };
  reward_claim_confirmed: { amount_usdm: string; tx_hash: string };
  reward_claim_failed: { reason: string };

  // Friction / errors that gate the golden path.
  gps_denied: Record<string, never>;
  gps_unavailable: Record<string, never>;
  gps_minipay_ios_blocked: Record<string, never>;
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
    },
  });
  initialized = true;
  log.info("posthog initialized", { host: "/ingest" });
  return posthog;
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
 * Add or update properties on the current user without a new event. Used for
 * post-connect enrichment (username picked, wallet linked, etc.).
 */
export function setUserProps(props: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.setPersonProperties(props);
}
