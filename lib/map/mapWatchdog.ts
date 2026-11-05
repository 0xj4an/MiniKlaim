import type { FailureStage } from "@/lib/map/mapFailureKind";

/**
 * How long a map may take before not having drawn is itself the finding.
 *
 * The telemetry had `map_render_ready` and `map_render_failed` and nothing in
 * between, so a map that starts and quietly never finishes produced no event
 * at all: not a success, not a failure, invisible. That is the shape of the
 * complaint this exists for, 0xj4an on an iPhone on 4G, "no me quiso cargar
 * el mapa", with nothing in Sentry or PostHog to match it against.
 *
 * 15 s is chosen from the measured numbers, not picked round. On the throttled
 * runs a map on slow 3G was interactive inside 2 s and the whole page finished
 * in 17 s, so a map still blank at 15 s is not a slow connection doing its
 * job: something is stuck. The tradeoff is deliberate: a player on a genuinely
 * terrible link may be reported as stalled while the map is still coming, so
 * the event carries `ms` and the stage reached and is a warning, never an
 * error.
 */
export const MAP_STALL_MS = 15_000;

/** The furthest a map got before the clock ran out. */
export type MapProgress = "import" | "construct" | "style" | "draw";

/**
 * The stage a stalled map should be reported at: the one after whatever it
 * last completed, because that is the step it is stuck in.
 */
export function stalledStage(last: MapProgress | null): FailureStage {
  switch (last) {
    case "draw":
    case "style":
      return "draw";
    case "construct":
      return "style";
    case "import":
      return "construct";
    default:
      return "import";
  }
}

/**
 * Whether a map that has not drawn yet is late enough to report.
 *
 * Kept separate from the timer so the rule can be tested without waiting
 * fifteen seconds, and so the threshold has one definition.
 */
export function isStalled(startedAt: number, now: number): boolean {
  return now - startedAt >= MAP_STALL_MS;
}
