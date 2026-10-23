import type { ErrorEvent } from "@sentry/nextjs";
import { clientWalletHost } from "@/lib/client/walletHost";
import { headSnapshot } from "@/lib/client/headWatch";
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
        // A WebGL failure that crashed the page into the error boundary is a
        // bug of ours (no notice, no fallback), so that one is kept.
        if (
          event.tags?.boundary !== "app" &&
          parts.some((part) => isWebglFailure(part))
        ) {
          return null;
        }
        // MINIKLAIM-T: a hoisted <head> tag was removed by someone else.
        // Ship what <head> looks like now; head.removed crumbs show who.
        if (parts.some((part) => part.includes("reading 'removeChild'"))) {
          try {
            event.contexts = { ...event.contexts, head: headSnapshot(document) };
          } catch {
            // Diagnostics only.
          }
        }
      }
      // A wallet extension threw inside its own injected script (MetaMask's
      // "Failed to connect", "extension not found": MINIKLAIM-13). Kept, so
      // a real wallet problem stays visible, but as a warning grouped into one
      // issue per extension and message instead of a new issue each time.
      const ext = extensionSource(event);
      if (ext) {
        event.level = "warning";
        event.tags = { ...event.tags, source: "wallet-extension", extension: ext };
        event.fingerprint = ["wallet-extension", ext, normalise(parts[1] ?? parts[0] ?? "")];
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

const EXTENSION_FRAME = /(chrome|moz|safari-web)-extension:\/\/|\/scripts\/inpage\.js|\/inpage\.js|contentscript/i;

/** The extension that threw, when every frame of the error is its own code. */
export function extensionSource(event: ErrorEvent): string | null {
  const frames = (event.exception?.values ?? []).flatMap((v) => v.stacktrace?.frames ?? []);
  if (frames.length === 0) return null;
  const paths = frames.map((f) => f.abs_path ?? f.filename ?? "");
  if (!paths.every((p) => EXTENSION_FRAME.test(p))) return null;
  const text = (event.exception?.values ?? []).map((v) => v.value ?? "").join(" ");
  if (/metamask/i.test(text) || paths.some((p) => /inpage\.js/.test(p))) return "metamask";
  return "unknown";
}

function normalise(message: string): string {
  return message.replace(/0x[0-9a-f]{6,}/gi, "0x…").replace(/\d+/g, "#").slice(0, 80);
}
