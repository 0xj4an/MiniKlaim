/**
 * Where a claim batch spends its time, and a watch for the ones that never
 * get to say so.
 *
 * The end-of-request "slow claim batch" line only exists if the request
 * ends. On 20 Nov 2026 one claim was cut by the proxy at 30 s and its 100
 * blocks landed 714 s later through a retry, with no line at all for the
 * request that mattered. The watch logs while the request is still running
 * (and when the phone hangs up), naming the step it is stuck in.
 */
export type PhaseTimer = {
  mark(name: string): void;
  total(): number;
  phases(): Record<string, number>;
  /** The last step finished; the request is in whatever comes after it. */
  lastMark(): string;
};

export function phaseTimer(now: () => number = () => performance.now()): PhaseTimer {
  const start = now();
  let last = start;
  let lastName = "start";
  const ms: Record<string, number> = {};
  return {
    mark(name: string) {
      const t = now();
      ms[name] = Math.round(t - last);
      last = t;
      lastName = name;
    },
    total: () => Math.round(now() - start),
    phases: () => ({ ...ms }),
    lastMark: () => lastName,
  };
}

/** Still running after this long: say so, twice at most. */
export const CLAIM_WATCH_MS = [10_000, 25_000] as const;

export type ClaimWatchLog = (
  message: string,
  data: Record<string, unknown>,
) => void;

/**
 * Logs a line at each CLAIM_WATCH_MS mark while the request is running, and
 * one if the client goes away first. Call the returned function when the
 * request ends, however it ends.
 */
export function watchClaim(
  timing: PhaseTimer,
  runId: string,
  warn: ClaimWatchLog,
  signal?: AbortSignal,
): () => void {
  const snapshot = () => ({
    runId,
    runningMs: timing.total(),
    after: timing.lastMark(),
    ...timing.phases(),
  });
  const timers = CLAIM_WATCH_MS.map((ms) =>
    setTimeout(() => warn("claim batch still running", snapshot()), ms),
  );
  // Timers must never keep the process alive on their own.
  for (const t of timers) t.unref?.();
  const onAbort = () => warn("claim batch client gone", snapshot());
  signal?.addEventListener("abort", onAbort, { once: true });
  return () => {
    for (const t of timers) clearTimeout(t);
    signal?.removeEventListener("abort", onAbort);
  };
}
