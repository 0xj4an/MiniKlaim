import * as Sentry from "@sentry/nextjs";
import { sentryInitOptions } from "@/lib/sentryOptions";

Sentry.init({
  ...sentryInitOptions(),
  integrations: [
    // What the process was doing while it could not answer.
    //
    // lib/eventLoopStall.ts says that it froze and for how long: 63 times in
    // about 40 h on 24-25 Nov 2026, 1.2 s at the median and 6.1 s at worst,
    // with claims waiting behind each one. It cannot say on what. The world
    // list rebuild was the suspect and was rewritten that day; the next
    // freeze (4.5 s, 22:16Z) came with no rebuild running.
    //
    // A second thread watches this one and, when it has not answered for
    // 1.5 s, takes its stack through the inspector and sends it to Sentry as
    // "Application Not Responding". The inspector listens on loopback inside
    // the container only. Capped per process so a bad hour cannot flood the
    // project; a restart (every deploy) starts the count again.
    Sentry.anrIntegration({
      captureStackTrace: true,
      anrThreshold: 1_500,
      maxAnrEvents: 20,
    }),
  ],
});
