type Level = "debug" | "info" | "warn" | "error";
type LogFn = (msg: string, data?: unknown) => void;

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Lowest level that gets through, from `LOG_LEVEL` when it names one.
 *
 * The default stays as it was: warn in production, debug everywhere else.
 * The override exists for the scheduled maintenance jobs, which run with
 * NODE_ENV=production and report only through `log.info` — so they ran
 * completely silently, and a job you cannot verify from its logs is a job
 * you cannot trust (found 29 Oct 2026, when `settle-backlog` exited 0 and
 * said nothing at all).
 */
export function resolveMinLevel(
  logLevel: string | undefined,
  nodeEnv: string | undefined,
): number {
  const named = (logLevel ?? "").trim().toLowerCase();
  // hasOwn, not `in`: `in` walks the prototype, so LOG_LEVEL=constructor
  // would set the threshold to a function and compare NaN forever after.
  if (Object.hasOwn(LEVELS, named)) return LEVELS[named as Level];
  return nodeEnv === "production" ? LEVELS.warn : LEVELS.debug;
}

const minLevel = resolveMinLevel(process.env.LOG_LEVEL, process.env.NODE_ENV);

export type Logger = Record<Level, LogFn>;

const noop: LogFn = () => {};

/**
 * Builds a namespaced logger. Each method is `console.<level>.bind(console, tag)`
 * so DevTools shows the original callsite (e.g. `minipay.ts:25`) instead of the
 * wrapper file. Disabled levels resolve to a noop with no per-call overhead.
 */
export function createLogger(namespace: string): Logger {
  const tag = `[${namespace}]`;
  const make = (level: Level): LogFn => {
    if (LEVELS[level] < minLevel) return noop;
    const target =
      level === "warn"
        ? console.warn
        : level === "error"
          ? console.error
          : console.log;
    return target.bind(console, tag) as LogFn;
  };
  return {
    debug: make("debug"),
    info: make("info"),
    warn: make("warn"),
    error: make("error"),
  };
}
