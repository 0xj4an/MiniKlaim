import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/sentryOptions";

// A watcher that took the stack of a frozen server ran here for one evening
// (25 Nov 2026). Six freezes, six unrelated stacks: no code of ours to point
// at, and one new issue with two emails for each. It answered its question
// and was removed; lib/eventLoopStall.ts carries the next one (the garbage
// collector) on its own log line, without mail.
Sentry.init(sentryInitOptions());
