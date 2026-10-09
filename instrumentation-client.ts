import * as Sentry from "@sentry/nextjs";
import { initAnalytics } from "@/lib/analytics";
import { sentryInitOptions } from "@/lib/sentryOptions";

// Before React. Wagmi reconnects in an effect and the iOS bridge can reject
// postMessage in that same turn. PostHogProvider used to init later, so those
// rejections reached Sentry and never became a PostHog $exception.
Sentry.init(sentryInitOptions());
initAnalytics();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
