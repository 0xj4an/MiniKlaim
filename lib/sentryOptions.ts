import type { ErrorEvent } from "@sentry/nextjs";
import { clientWalletHost } from "@/lib/client/walletHost";
import { isBrowserNoise } from "@/lib/errors/browserNoise";

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
      if (typeof window !== "undefined") {
        event.tags = {
          ...event.tags,
          wallet_host: clientWalletHost(),
          pathname: window.location.pathname,
        };
        // Same iOS postMessage rejection was splitting into C/D/E/F because
        // WebKit sometimes keeps the wagmi frame and sometimes strips it.
        if (parts.some((part) => part.includes(WALLET_BRIDGE))) {
          event.fingerprint = ["wallet-bridge-postmessage"];
        }
      }
      return event;
    },
  };
}
