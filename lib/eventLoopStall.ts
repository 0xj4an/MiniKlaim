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

/**
 * Garbage collection seen since the last check.
 *
 * 25 Nov 2026: a watcher took the stack of six freezes of 1.5 s or more.
 * Each was somewhere else (React rendering, building a query, reading a
 * Postgres reply, Sentry packing an envelope), the container had no CPU
 * limit and had never been throttled, and the host had idle cores. A thread
 * that stops in arbitrary code with CPU to spare is being stopped from
 * outside its own code: the collector, or the kernel reclaiming memory.
 * This says which, on the same line as the freeze.
 */
export type GcWindow = { maxMs: number; totalMs: number; kind: string; count: number };

const GC_KINDS: Record<number, string> = {
  1: "minor",
  2: "major",
  4: "incremental",
  8: "weak",
};

export function gcWindow(): GcWindow & { add(ms: number, kind?: number): void; take(): GcWindow } {
  const w = {
    maxMs: 0,
    totalMs: 0,
    kind: "none",
    count: 0,
    add(ms: number, kind?: number) {
      w.count += 1;
      w.totalMs += ms;
      if (ms > w.maxMs) {
        w.maxMs = ms;
        w.kind = (kind !== undefined && GC_KINDS[kind]) || "other";
      }
    },
    take(): GcWindow {
      const out = {
        maxMs: Math.round(w.maxMs),
        totalMs: Math.round(w.totalMs),
        kind: w.kind,
        count: w.count,
      };
      w.maxMs = 0;
      w.totalMs = 0;
      w.kind = "none";
      w.count = 0;
      return out;
    },
  };
  return w;
}

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
  const { monitorEventLoopDelay, PerformanceObserver } = await import(
    "node:perf_hooks"
  );
  const log = createLogger("server:eventLoop");
  const gc = gcWindow();
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const detail = (entry as { detail?: { kind?: number } }).detail;
        gc.add(entry.duration, detail?.kind);
      }
    }).observe({ entryTypes: ["gc"] });
  } catch {
    // The freeze is still reported, without its collector figures.
  }
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const timer = setInterval(() => {
    const report = stallReport({
      max: delay.max,
      p99: delay.percentile(99),
      mean: delay.mean,
    });
    delay.reset();
    const collected = gc.take();
    if (report) {
      const mem = process.memoryUsage();
      log.warn("event loop stalled", {
        ...report,
        gcMaxMs: collected.maxMs,
        gcTotalMs: collected.totalMs,
        gcKind: collected.kind,
        gcCount: collected.count,
        heapMB: Math.round(mem.heapUsed / 1e6),
        rssMB: Math.round(mem.rss / 1e6),
      });
    }
  }, CHECK_EVERY_MS);
  timer.unref();
}
