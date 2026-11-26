/** Flag file ops/deploy.sh drops before replacing a container. See app/api/ready. */
export const DRAIN_FLAG = "/tmp/miniklaim-draining";

/** Seconds after start a container is let in even without a warm world list. */
export const COLD_MAX_S = 90;

export type Readiness = { ready: boolean; reason?: "draining" | "warming" };

export function readiness(input: {
  draining: boolean;
  warm: boolean;
  uptimeS: number;
}): Readiness {
  if (input.draining) return { ready: false, reason: "draining" };
  if (!input.warm && input.uptimeS < COLD_MAX_S) {
    return { ready: false, reason: "warming" };
  }
  return { ready: true };
}
