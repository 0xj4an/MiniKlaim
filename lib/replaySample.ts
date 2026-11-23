/**
 * Which devices record session replays.
 *
 * Replay is for debugging MiniPay sessions, and the free plan holds 5,000
 * recordings a month. November 2026 ran at about 360 a day and hit the cap
 * on the 20th: every session after that went unrecorded, including the ones
 * a bug report would have needed. Recording four devices in ten spreads the
 * same budget over the whole month (360 x 0.4 x 30 = 4,320).
 *
 * Per device, not per session: the roll is stored, so a player who is
 * recorded stays recorded and a reported problem can be followed across
 * their sessions.
 */
export const REPLAY_SAMPLE = 0.4;

const KEY = "miniklaim_replay_roll";

type Store = Pick<Storage, "getItem" | "setItem">;

export function replaySampled(
  store: Store | null = typeof window === "undefined" ? null : safeStore(),
  random: () => number = Math.random,
  sample: number = REPLAY_SAMPLE,
): boolean {
  let roll: number | null = null;
  try {
    const stored = store?.getItem(KEY);
    const n = stored === null || stored === undefined ? NaN : Number(stored);
    if (Number.isFinite(n) && n >= 0 && n < 1) roll = n;
  } catch {
    // Storage refused: fall through to a roll for this page load.
  }
  if (roll === null) {
    roll = random();
    try {
      store?.setItem(KEY, String(roll));
    } catch {
      // Private mode: the roll lasts this page load only.
    }
  }
  return roll < sample;
}

function safeStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
