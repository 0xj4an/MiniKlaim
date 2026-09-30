import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/sentryOptions";

Sentry.init(sentryInitOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
