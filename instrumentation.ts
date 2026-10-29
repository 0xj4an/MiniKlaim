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
    // A NEXT_PUBLIC_* set only in the container environment changes nothing
    // the client does, because the bundles have the build-time value baked
    // in. That is silent, and on 29 Oct 2026 it cost a day: the server was
    // ready to reinforce blocks while the client dropped the player's own
    // blocks from the claim. Logged at error level so it survives the
    // production log floor and reaches Sentry.
    const [{ reportEnvSkew }, { createLogger }] = await Promise.all([
      import("./lib/envSkew"),
      import("./lib/logger"),
    ]);
    reportEnvSkew(createLogger("env:skew"));
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
