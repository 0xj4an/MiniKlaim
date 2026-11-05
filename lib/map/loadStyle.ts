"use client";

import { track } from "@/lib/analytics";
import { createLogger } from "@/lib/logger";
import {
  FALLBACK_STYLE,
  isUsableStyle,
  STYLE_TIMEOUT_MS,
  STYLE_URL,
  type BasemapStyle,
} from "@/lib/map/basemapStyle";

const log = createLogger("map:style");

/**
 * The style to build a map with, fetched by us rather than by MapLibre.
 *
 * Handing MapLibre a URL means MapLibre owns the failure: it waits as long as
 * the request takes and, if the request never finishes, so does the map. That
 * is the whole bug. Fetching it ourselves costs the same single request and
 * puts three things in our hands instead: a timeout, a fallback, and an event
 * saying which of the two happened.
 *
 * The result is memoised for the page load. Every map on a page agrees on its
 * basemap, and moving between /run, /me and /community does not re-ask.
 */
let memo: Promise<BasemapStyle> | null = null;

export type StyleOutcome = "origin" | "fallback";

async function fetchStyle(): Promise<BasemapStyle> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STYLE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(STYLE_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`style ${res.status}`);
    const json: unknown = await res.json();
    if (!isUsableStyle(json)) throw new Error("style unusable");
    track("map_style_loaded", {
      outcome: "origin",
      ms: Date.now() - startedAt,
    });
    return json;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A warning, not an error. The player still gets a working map, so this
    // is a degraded basemap rather than a broken page, and paging on it would
    // train us to ignore the page. The count is what matters, and PostHog has
    // the count.
    log.warn("basemap style fell back", {
      message,
      ms: Date.now() - startedAt,
    });
    track("map_style_loaded", {
      outcome: "fallback",
      ms: Date.now() - startedAt,
      reason: message,
    });
    return FALLBACK_STYLE;
  } finally {
    clearTimeout(timer);
  }
}

export function resolveMapStyle(): Promise<BasemapStyle> {
  if (!memo) memo = fetchStyle();
  return memo;
}

/** Whether a resolved style is the no-basemap one, for a "streets are missing" note. */
export function isFallbackStyle(style: BasemapStyle): boolean {
  return style === FALLBACK_STYLE;
}

/** Test seam: drop the memo so the next call fetches again. */
export function resetStyleMemo(): void {
  memo = null;
}
