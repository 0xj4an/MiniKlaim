import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Railway has no IPv6 egress, and Node's happy-eyeballs gives each
    // address 250 ms. The Sentry tunnel (/monitoring) then failed with
    // ETIMEDOUT 34.160.81.0 + ENETUNREACH on the v6 address, dropping client
    // errors. Prefer IPv4 and give the connect a real timeout.
    const dns = await import("node:dns");
    const net = await import("node:net");
    dns.setDefaultResultOrder("ipv4first");
    net.setDefaultAutoSelectFamilyAttemptTimeout(2000);
    // The /ingest rewrite (PostHog proxy) pipes the upstream response through
    // Next's compression wrapper, and Sentry's http instrumentation adds its own
    // listeners. Each proxied response ends up with 11 "close" listeners, one
    // over Node's default of 10, so every PostHog event logged a
    // MaxListenersExceededWarning (~600/h). The listeners are per response and
    // go away when it closes; this is not a leak. Raise the cap for responses
    // only, leaving the default in place for every other emitter.
    const http = await import("node:http");
    http.ServerResponse.prototype.setMaxListeners(20);
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
