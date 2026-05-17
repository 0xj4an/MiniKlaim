type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel =
  process.env.NODE_ENV === "production" ? LEVELS.warn : LEVELS.debug;

export type Logger = Record<Level, (msg: string, data?: unknown) => void>;

export function createLogger(namespace: string): Logger {
  const tag = `[${namespace}]`;

  function emit(level: Level, msg: string, data?: unknown) {
    if (LEVELS[level] < minLevel) return;
    const fn =
      level === "warn"
        ? console.warn
        : level === "error"
          ? console.error
          : console.log;
    if (data !== undefined) fn(tag, msg, data);
    else fn(tag, msg);
  }

  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
  };
}
