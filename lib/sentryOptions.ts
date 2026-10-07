import type { ErrorEvent } from "@sentry/nextjs";
import { isBrowserNoise } from "@/lib/errors/browserNoise";

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
      return event;
    },
  };
}
