import type { ErrorEvent } from "@sentry/nextjs";
import { clientWalletHost } from "@/lib/client/walletHost";
import { isBrowserNoise } from "@/lib/errors/browserNoise";
import { isWebglFailure } from "@/lib/map/isWebglFailure";

const WALLET_BRIDGE = "The object does not support the operation or argument.";

type SentryInitOptions = {
  dsn: string | undefined;
  enabled: boolean;
  environment: string | undefined;
  tracesSampleRate: number;
  sendDefaultPii: false;
  ignoreErrors: string[];
  beforeSend: (event: ErrorEvent) => ErrorEvent | null;
};

export function sentryInitOptions(): SentryInitOptions {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    ignoreErrors: [
      "Connection closed",
      "Script error.",
      "Java bridge method invocation error",
    ],
    beforeSend(event) {
      const parts = [
        event.message ?? "",
        ...(event.exception?.values ?? []).map((v) => v.value ?? ""),
      ];
      if (parts.some((part) => isBrowserNoise(part))) return null;
      // Every frame in PostHog's proxied scripts: a third-party script that
      // arrived truncated (MINIKLAIM-Y). Nothing of ours ran.
      if (onlyThirdPartyFrames(event)) return null;
      if (typeof window !== "undefined") {
        event.tags = {
          ...event.tags,
          wallet_host: clientWalletHost(),
          pathname: window.location.pathname,
        };
        // MiniPay's iOS bridge rejects a postMessage during wagmi's
        // reconnect. Only native frames, nothing in our code to change, and
        // no effect on the session (MINIKLAIM-H). Counted in PostHog instead.
        if (parts.some((part) => part.includes(WALLET_BRIDGE))) {
          void import("@/lib/analytics").then(({ track }) =>
            track("wallet_bridge_rejected", {}),
          ).catch(() => {});
          return null;
        }
        // The device cannot draw the map (MINIKLAIM-W). The page shows a
        // notice and PostHog counts it; Sentry would only repeat it per frame.
        if (parts.some((part) => isWebglFailure(part))) return null;
      }
      return event;
    },
  };
}

const THIRD_PARTY = ["/ingest/static/"];

export function onlyThirdPartyFrames(event: ErrorEvent): boolean {
  const frames = (event.exception?.values ?? []).flatMap(
    (v) => v.stacktrace?.frames ?? [],
  );
  if (frames.length === 0) return false;
  return frames.every((f) =>
    THIRD_PARTY.some((p) => (f.abs_path ?? f.filename ?? "").includes(p)),
  );
}
