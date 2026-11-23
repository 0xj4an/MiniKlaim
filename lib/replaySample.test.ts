import { describe, expect, it } from "vitest";
import { replaySampled } from "./replaySample";

function store(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe("replaySampled", () => {
  it("records a device whose roll is under the sample, and remembers the roll", () => {
    const s = store();
    expect(replaySampled(s, () => 0.1, 0.4)).toBe(true);
    // A different roll now must not change the answer.
    expect(replaySampled(s, () => 0.9, 0.4)).toBe(true);
  });

  it("leaves out a device whose roll is over it, every time", () => {
    const s = store();
    expect(replaySampled(s, () => 0.4, 0.4)).toBe(false);
    expect(replaySampled(s, () => 0.0, 0.4)).toBe(false);
  });

  it("rolls again over a broken stored value, and works with no storage", () => {
    expect(replaySampled(store({ miniklaim_replay_roll: "abc" }), () => 0.2, 0.4)).toBe(true);
    expect(replaySampled(null, () => 0.2, 0.4)).toBe(true);
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(replaySampled(throwing, () => 0.7, 0.4)).toBe(false);
  });
});
