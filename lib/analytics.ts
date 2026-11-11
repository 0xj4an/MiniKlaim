"use client";

import posthog, { type PostHog } from "posthog-js";
import type { MoveMode } from "@/lib/runs/moveMode";
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
  /**
   * Wallet linking, instrumented end to end.
   *
   * `wallet_linked` was declared here and fired from nowhere, and the rest of
   * the funnel did not exist at all. So the question "is linking used?" came
   * back as zero events, and on 31 Oct that was read as "nobody uses it"
   * (P67). It was not an answer, it was the absence of one: there was no way
   * to tell a player who never saw the panel from one who saw it and walked
   * away. `link_prompt_shown` is the one that settles that, which is why it
   * is here even though it fires on a render and not on an action.
   */
  link_prompt_shown: Record<string, never>;
  link_code_generated: { chain: string };
  link_redeem_started: { chain: string };
  wallet_linked: { linked_chain_id: number };
  /**
   * Why a redeem did not finish. The stages are distinct problems and the
   * fix for each is different: `wallet` is the player declining or the wallet
   * failing to send, `pending` is our backend never seeing the receipt after
   * five tries, and `rejected` is the backend refusing the code.
   */
  link_redeem_failed: {
    reason:
      | "user_cancelled"
      | "permission_denied"
      | "wallet"
      | "rejected"
      | "pending"
      | "threw";
    status?: number;
    /**
     * The wallet's own words and JSON-RPC code, on the stages where the wallet
     * is what failed. `wallet` kept firing next to `permission_denied` on
     * 9 Nov and the bucket alone could not say what it held.
     */
    message?: string;
    code?: string;
  };
  // Onboarding is a single static 3-step card, so there is nothing to page
  // through. Only fire on dismiss with the exit path so we can tell engaged
  // users (tapped the CTA) from disengaged (clicked the backdrop).
  onboarding_completed: { via: "cta" | "backdrop" };
  /** The 29 Oct 2026 outage notice: how the player closed it. */
  recovery_notice_dismissed: { via: "cta" | "later" | "backdrop" };
  // Home-screen campaign banner. Both events carry the campaign so the next
  // one is measurable on its own instead of being pooled with this one.
  /** Day streak shown on the home screen, before they choose to play. */
  home_streak_shown: { streak: number };
  campaign_banner_clicked: { campaign: string };
  campaign_banner_dismissed: { campaign: string };

  // Run lifecycle.
  run_started: {
    mode?: MoveMode;
    /**
     * Whether the phone had an accurate fix when Start was tapped. False is
     * a run that begins blind: 17 of 42 zero-block runs on 10 Nov 2026.
     */
    fix_ready?: boolean;
  };
  /** The color legend on the run map was opened, by itself or by the player. */
  run_legend_opened: { auto: boolean };
  // First batch of a run the server refused as too fast for a run on foot.
  run_foot_too_fast: { rejected: number };
  run_mode_too_fast: { rejected: number };
  run_finished: {
    duration_sec: number;
    blocks: number;
    /**
     * What the capture line said when the player tapped Finish. For a run
     * with zero blocks it is the reason: "searching" is no usable GPS fix,
     * "repeat" a block already acted on today, "acted" a reinforce or an
     * attack and no new block, "owned" a start on a block already held,
     * "ready" a fix but no move.
     */
    capture_state?:
      "saving" | "saved" | "acted" | "searching" | "repeat" | "owned" | "ready";
    distance_m: number;
    speed_kmh: number;
    move_mode: MoveMode | "none";
    // Hex strength only.
    reinforced?: number;
    damaged?: number;
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
  // MiniPay failed internally but reported it as a rejection. Not a decline.
  run_claim_wallet_error: { reason: string };
  run_claim_rejected: {
    hex_count: number;
    badge_count: number;
    reason: string;
  };
  run_claim_sponsored: { had_badges: boolean; trigger: string };
  /**
   * The relayer was asked first and handed the claim back, so the player paid
   * after all. `reason` is the server's: `player_can_pay` (the relayer is
   * below its claim floor), `daily_cap` (this wallet's allowance), or an HTTP
   * status. This is the measure of how often a free claim is not free.
   */
  run_claim_player_pays: { reason: string };
  run_claim_failed: { trigger: string };
  // Signature requested from the finish card. `auto_finish` is the sheet
  // that opens by itself. `button` is a retry after they declined.
  run_summary_claim_tapped: { blocks: number; via: "auto_finish" | "button" };
  /**
   * The NFT offer on the finish card, which the player pays for themselves.
   * `signatures` is how many wallet prompts the plan needs, so the drop-off
   * between one signature and several is measurable.
   */
  run_summary_nft_tapped: { pending: number; signatures: number };
  run_summary_nft_skipped: { pending: number };
  streak_shown: { streak: number; counted: boolean };

  // Badges.
  badge_unlocked: { badge_id: number; badge_name: string };
  // Pending badges shown to the player; `surface` is home | me | run.
  badge_claim_offered: { count: number; surface: string };
  badge_claim_later: { count: number; surface: string };
  badge_claim_started: { count: number; surface?: string };
  badge_claim_confirmed: { count: number; tx_hash: string; surface?: string };
  badge_claim_rejected: { count: number; reason: string; surface?: string };
  badge_claim_failed: { count: number; reason: string; surface?: string };

  // Network & error tracking.
  app_crash: { error: string; digest: string; stack: string };
  // A tab on an old build hit a missing chunk and reloaded itself.
  stale_chunk_reload: { path: string };
  // React failed to remove a <head> tag someone else already removed
  // (MINIKLAIM-T) and the page reloaded itself.
  head_detach_reload: { path: string };
  hexes_refresh_error: { status: number };
  /**
   * `elapsed_ms` and `online` tell a request that hung until it timed out
   * (slow server or slow network) from one that never left the phone. The
   * error text cannot: both read "Failed to fetch".
   */
  hexes_refresh_network_error: {
    error: string;
    elapsed_ms?: number;
    online?: boolean;
    capped?: boolean;
  };
  batch_claim_error: { status: number; count: number };
  batch_claim_network_error: {
    count: number;
    error: string;
    elapsed_ms?: number;
    online?: boolean;
    capped?: boolean;
  };
  run_start_error: { status: number };
  run_start_network_error: { error: string; capped?: boolean };
  run_finish_error: { status: number };
  run_finish_network_error: { error: string; capped?: boolean };
  blocks_captured: { count: number };

  // Rewards.
  reward_claim_started: { amount_usdm: string; badge_count: number };
  reward_claim_confirmed: { amount_usdm: string; tx_hash: string };
  reward_claim_failed: { reason: string };
  // Hidden treasures (tap + relayer claim).
  drop_found: { drop_id: string; token: string; amount: string };
  drop_heat: { level: number };
  // Weekly challenges (paid entry by token transfer).
  challenge_viewed: { challenge: string; entered: boolean };
  challenge_enter_started: { challenge: string; needs_approval?: boolean };
  challenge_approve_started: { challenge: string; amount: string };
  challenge_approve_sent: { challenge: string; tx_hash: string; fee: string };
  challenge_approved: { challenge: string; tx_hash: string };
  challenge_approve_failed: {
    reason: string;
    message?: string;
    code?: string;
    details?: string;
    error_name?: string;
    fees_tried?: string;
  };
  challenge_entered: { challenge: string; tx_hash: string; already?: boolean };
  challenge_enter_failed: {
    reason: string;
    tx_hash?: string;
    balance?: string;
    status?: number;
  };
  drop_claim_started: { count: number; surface: "run" | "me" };
  drop_claim_sent: { count: number; tx_hash: string };
  drop_claim_failed: { reason: string };
  // Support form (in-app form posted to /api/support).
  support_form_opened: { source?: "direct_link" };
  support_sent: { topic: string; chars: number; screenshot: boolean };
  support_failed: { status: number };
  // "Mint your blocks as NFTs" (Hexes v2).
  nft_mint_started: { count: number };
  nft_mint_confirmed: { count: number; tx_hash: string };
  nft_mint_failed: { reason: string; message?: string; count?: number };

  // Friction / errors that gate the golden path.
  /**
   * `prior_permission` is what the browser had already decided before we
   * asked. "denied" means it refused without showing a prompt, which the
   * player never saw happen; "prompt" means the player said no themselves.
   */
  gps_denied: { prior_permission: string };
  /** First-run location explainer shown before the browser prompt. */
  gps_prompt_shown: { permission: string };
  /**
   * What the browser already decided about location, read without prompting.
   * Tells us how many players are stuck on a denial they cannot see, and how
   * often MiniPay drops a permission it had already been given.
   */
  gps_permission_known: { permission: string };
  gps_prompt_accepted: Record<string, never>;
  /** "Try again" on the blocked-location banner. */
  gps_retry: { from: string };
  // The device GPU cannot draw the map. Sentry drops these; this counts them.
  map_webgl_failed: { path: string };
  // What the GPU supports, recorded once per page load before the first map.
  // MapLibre 6 requires WebGL2 and refuses to build a map without it, so
  // `webgl2` is the share of players who would keep their map on an upgrade.
  // `renderer` is null wherever the browser treats it as fingerprinting.
  map_gpu_support: {
    webgl: number;
    webgl2: boolean;
    renderer: string | null;
    max_texture_size: number | null;
    path: string;
  };
  // Which renderer a phone was given, and why. One per page load. `source`
  // says whether the answer was probed now or remembered, which is the first
  // thing to ask of a player report: a wrong remembered tier looks exactly
  // like a wrong probe until you can tell them apart.
  map_tier_resolved: {
    tier: "gl2" | "gl1" | "grid";
    source: "probe" | "cache" | "override";
    reason: string;
    webgl: number;
    renderer: string | null;
    max_texture_size: number | null;
  };
  // The map drew. `ms` is from the build call to the first frame, so a tier
  // that technically works but takes eight seconds is visible as such.
  map_render_ready: {
    tier: "gl2" | "gl1" | "grid";
    engine: "maplibre" | "grid";
    path: string;
    ms: number;
  };
  // The map did not draw. `stage` separates a library that would not load
  // from a constructor that threw from a style that never arrived, because
  // those have different causes and only one of them is the GPU.
  map_render_failed: {
    tier: "gl2" | "gl1" | "grid";
    engine: "maplibre" | "grid";
    path: string;
    stage: "import" | "construct" | "style" | "draw";
    // What gave up, which the stage cannot say: the worker and the tile host
    // both fail at `style`. Lets "the tile host is down" be counted apart
    // from "the bundle is wrong" without parsing messages in a query.
    cause: "worker" | "tiles" | "webgl" | "other";
    message: string;
  };
  // A map that started and never drew, and never threw either. Before this
  // the telemetry only had "ready" and "failed", so a map stuck halfway
  // produced no event at all and a player reporting "the map did not load"
  // could not be matched to anything. `ms` says how long it had been blank
  // and `stage` the step it was stuck in.
  // A tile, sprite or glyph that failed after the map was already on screen.
  // Separated from map_render_failed because mixing them inflated that metric
  // by a factor of forty: see the note on `drawn` in lib/map/mapTelemetry.
  map_tiles_degraded: {
    tier: string;
    path: string;
    cause: string;
    message: string;
  };
  map_render_stalled: {
    tier: "gl2" | "gl1" | "grid";
    engine: "maplibre" | "grid";
    path: string;
    stage: "import" | "construct" | "style" | "draw";
    ms: number;
  };
  // Where this load's basemap came from. `fallback` means the style could
  // not be had inside the budget and the map was built with no streets on
  // it, which used to be a map that never appeared at all. The rate of this
  // is the health of the tile host, measured on our side for the first time:
  // every previous failure happened on the player's phone against a third
  // party and was invisible to us.
  map_style_loaded: {
    outcome: "origin" | "fallback";
    ms: number;
    reason?: string;
  };
  // The GPU took the context back, usually under memory pressure. Distinct
  // from a failure: the map worked and then stopped.
  map_context_lost: { tier: "gl2" | "gl1" | "grid"; path: string };
  // A tier was proven wrong by a failure and thrown away, so the next load
  // probes again instead of repeating it for a week.
  map_tier_forgotten: { tier: "gl2" | "gl1" | "grid"; reason: string };
  // The player closed the "this phone cannot draw the map" notice. How often
  // this happens on a tier is the closest thing to asking them whether the
  // fallback is acceptable.
  map_notice_dismissed: { tier: "gl2" | "gl1" | "grid"; path: string };
  // MiniPay iOS rejects a postMessage in its own bridge (not app code).
  wallet_bridge_rejected: Record<string, never>;
  gps_unavailable: Record<string, never>;
  /**
   * The GPS chip did not answer in time and we asked the network provider
   * instead, rather than telling the player they cannot play. `code` is the
   * Geolocation error that triggered it. Count it against gps_retry, the
   * banner's Try again button: 201 people tapped that in 7 days.
   */
  gps_coarse_retry: { code: number };
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
  share_button_pressed: {
    surface: "run_summary" | "profile";
    channel?: "x" | "facebook" | "instagram";
  };
  // Which path actually worked: web intent, system sheet, clipboard, none.
  share_result: {
    surface: "run_summary" | "profile";
    channel: "x" | "facebook" | "instagram" | "sheet";
    method: "intent" | "sheet" | "copied" | "none";
  };
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
    // Autocapture was ~21k events a day (Oct 2026) and pushing the billing
    // limit; every decision we take reads our own named events instead.
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
    capture_performance: true,
    // Global window.onerror + unhandledrejection hooks. Errors show up as
    // $exception events in PostHog with stack traces (grouped by fingerprint).
    // Cheaper than wiring a full Sentry SDK, sufficient for a hobby MVP.
    capture_exceptions: true,
    // PostHog's surveys bundle is 37 KB on the wire and nothing here uses
    // surveys. On the connections this game runs on that is a request and a
    // download for a feature that does not exist.
    disable_surveys: true,
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
    // Replay pulls a ~150 KB recorder script and records every DOM change.
    // On 2 GB Android phones and data-saver proxies (Opera Mini on itel, 15
    // Oct) the script arrived broken and threw (MINIKLAIM-Y). Skip it there.
    disable_session_recording: isConstrainedDevice(),
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

/** Low memory, few cores, or the user asked the browser to save data. */
export function isConstrainedDevice(
  nav: {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    connection?: { saveData?: boolean };
  } | null = typeof navigator === "undefined" ? null : (navigator as never),
): boolean {
  if (!nav) return false;
  if (nav.connection?.saveData === true) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2)
    return true;
  if (
    typeof nav.hardwareConcurrency === "number" &&
    nav.hardwareConcurrency <= 2
  )
    return true;
  return false;
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

/** Events sent per key by trackLimited in this page session; the rest are dropped. */
export const LIMITED_EVENTS_PER_SESSION = 5;
const limitedCounts = new Map<string, number>();

/**
 * Take one of the `limit` slots for `key`. `send` is false once they are used
 * up; `capped` marks the last one so the receiver knows more were dropped.
 */
export function takeLimitedSlot(
  key: string,
  limit = LIMITED_EVENTS_PER_SESSION,
): { send: boolean; capped: boolean } {
  const n = (limitedCounts.get(key) ?? 0) + 1;
  if (n > limit) return { send: false, capped: false };
  limitedCounts.set(key, n);
  return { send: true, capped: n === limit };
}

/**
 * Like track(), but at most LIMITED_EVENTS_PER_SESSION times per event name
 * in a page session, and the last one carries `capped: true`. For retry-loop
 * errors (a player without signal during a long run fires hundreds of
 * identical "Failed to fetch" events) a handful says as much as all of them,
 * and the per-day totals stop depending on one phone's coverage.
 */
export function trackLimited<E extends EventName>(
  event: E,
  properties: EventMap[E],
  limit = LIMITED_EVENTS_PER_SESSION,
): boolean {
  const slot = takeLimitedSlot(event, limit);
  if (!slot.send) return false;
  track(event, slot.capped ? { ...properties, capped: true } : properties);
  return true;
}

/** Test hook: forget the per-session counts. */
export function resetLimitedEvents(): void {
  limitedCounts.clear();
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
  const id = address.toLowerCase();
  // Same wallet as the stored identity: only refresh the person properties.
  // A repeat identify() is a no-op for PostHog anyway, but this keeps it from
  // sending an $identify event on every page load.
  if (posthog.get_distinct_id() === id) {
    if (props) posthog.setPersonProperties(props);
    return;
  }
  posthog.identify(id, props);
}

/** Clear identity on disconnect so subsequent events are anonymous again. */
export function resetIdentity(): void {
  if (!initialized) return;
  posthog.reset();
}

export type IdentityAction = "identify" | "reset" | "none";

/**
 * What to do with the PostHog identity for the current wallet state.
 *
 * wagmi starts every page load as "connecting"/"reconnecting" (or briefly
 * "disconnected" before the MiniPay provider injects) and only then reports
 * the account. Resetting on that first not-connected render threw away the
 * stored identity and minted a new anonymous person on every page load, which
 * is why PostHog counted ~14k people against ~8k real players. So: identify
 * whenever an address is connected; reset only when a wallet that was
 * identified in this page session actually disconnects.
 */
export function identityAction(
  status: "connected" | "connecting" | "reconnecting" | "disconnected",
  address: string | undefined,
  identifiedThisSession: string | null,
): IdentityAction {
  if (status === "connected" && address) return "identify";
  if (status === "disconnected" && identifiedThisSession) return "reset";
  return "none";
}

let lastUsername: string | null = null;

/** Attach the player's username to their PostHog person, once per change. */
export function setPersonUsername(username: string | null | undefined): void {
  if (!initialized || !username || username === lastUsername) return;
  lastUsername = username;
  posthog.setPersonProperties({ username });
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
