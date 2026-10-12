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
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
