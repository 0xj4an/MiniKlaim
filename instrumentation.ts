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
    // The world list takes 2.60 s to build, and a route module is only
    // evaluated on its first request, so after every deploy one player paid
    // that 2.6 s on an endpoint whose rebuild blocks the process. Build it
    // now instead.
    //
    // The module is imported with await and the import is caught: the first
    // version was `void import(...).then(...)`, which swallows a rejected
    // import whole. It did reject in production, and the only symptom was
    // that nothing happened, measured as a 10 s first request after a
    // restart. The warm itself is still not awaited, because a slow database
    // should delay the world map and not the boot.
    try {
      const { warmWorldList } = await import("./lib/map/worldList");
      void warmWorldList();
    } catch (e) {
      createLogger("map:worldList").warn("world list warm could not start", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
