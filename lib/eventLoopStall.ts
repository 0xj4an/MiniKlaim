import { createLogger } from "@/lib/logger";

/**
 * Says when this process stopped answering.
 *
 * 14 Nov 2026: six times in one day the proxy found both app containers
 * unreachable for a few seconds, and nothing explained it. CPU was low,
 * memory was free, the app logged no error. What could not be told apart
 * was "the process was frozen" from "the process was fine and the network
 * between the proxy and it was not". This is the missing half: a frozen
 * process cannot run its timers, so the delay of a timer is how long it
 * was frozen. Both containers reporting the same second means the whole
 * machine paused; neither reporting means the fault is outside the app.
 */
export const STALL_WARN_MS = 1_000;
const CHECK_EVERY_MS = 10_000;

export type StallReport = { maxMs: number; p99Ms: number; meanMs: number };

/** The line to log for this window, or null when nothing stalled. */
export function stallReport(
  ns: { max: number; p99: number; mean: number },
  warnMs = STALL_WARN_MS,
): StallReport | null {
  if (!Number.isFinite(ns.max) || ns.max / 1e6 < warnMs) return null;
  const ms = (v: number) => (Number.isFinite(v) ? Math.round(v / 1e6) : 0);
  return { maxMs: ms(ns.max), p99Ms: ms(ns.p99), meanMs: ms(ns.mean) };
}

let started = false;

/** Start watching. Safe to call twice; the timer never keeps the process up. */
export async function watchEventLoop(): Promise<void> {
  if (started) return;
  started = true;
  const { monitorEventLoopDelay } = await import("node:perf_hooks");
  const log = createLogger("server:eventLoop");
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const timer = setInterval(() => {
    const report = stallReport({
      max: delay.max,
      p99: delay.percentile(99),
      mean: delay.mean,
    });
    delay.reset();
    if (report) log.warn("event loop stalled", report);
  }, CHECK_EVERY_MS);
  timer.unref();
}
