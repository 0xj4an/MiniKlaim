import * as Sentry from "@sentry/nextjs";

/**
 * Client errors that the app handles itself (it shows a notice, retries or
 * backs off) used to reach only PostHog. These helpers send them to Sentry as
 * well, grouped into one issue per kind, and capped per page session so one
 * device stuck in a retry loop cannot flood the project.
 */

type Capture = (
  message: string,
  context: {
    level: "warning" | "error";
    tags: Record<string, string>;
    fingerprint: string[];
  },
) => void;

/**
 * Sent as an Error named "ClientReport" rather than a message: with
 * attachStacktrace on, captureMessage titled the issue after the minified
 * caller ("e"), which hid what the report was about in the Sentry list.
 * Grouping does not depend on the stack because every report sets a fingerprint.
 */
const sentryCapture: Capture = (message, context) => {
  const err = new Error(message);
  err.name = "ClientReport";
  Sentry.captureException(err, context);
};

/** Reports per key and page session; the rest are dropped. */
export const REPORTS_PER_KEY = 3;

export function createReporter(capture: Capture = sentryCapture) {
  const counts = new Map<string, number>();

  function allow(key: string): boolean {
    const n = counts.get(key) ?? 0;
    if (n >= REPORTS_PER_KEY) return false;
    counts.set(key, n + 1);
    return true;
  }

  return {
    /**
     * A 5xx the client saw from one of our routes. Grouped by endpoint and
     * status, so all 504s on /api/hexes are one issue. Lower statuses are the
     * caller's business (429 backs off, 409 ends the run) and are ignored.
     */
    serverError(endpoint: string, status: number): boolean {
      if (!Number.isFinite(status) || status < 500) return false;
      const key = `http:${endpoint}:${status}`;
      if (!allow(key)) return false;
      capture(`HTTP ${status} from ${endpoint}`, {
        level: "warning",
        tags: { endpoint, status: String(status), source: "client-fetch" },
        fingerprint: ["http-5xx", endpoint, String(status)],
      });
      return true;
    },

    /** The map could not start WebGL; the page carries on without it. */
    webglFailed(path: string): boolean {
      if (!allow(`webgl:${path}`)) return false;
      capture("Map WebGL failed to start", {
        level: "warning",
        tags: { path, source: "map" },
        fingerprint: ["map-webgl-failed", path],
      });
      return true;
    },
  };
}

const reporter = createReporter();

export const reportServerError = reporter.serverError;
export const reportWebglFailure = reporter.webglFailed;

/**
 * Endpoint label without ids or query strings, so /api/runs/<uuid>/claim
 * groups as one route.
 */
export function endpointLabel(url: string): string {
  const path = url.split("?")[0] ?? url;
  return path
    .split("/")
    .map((seg) =>
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seg) || /^0x[0-9a-f]{40}$/i.test(seg) || /^\d+$/.test(seg)
        ? ":id"
        : seg,
    )
    .join("/");
}
