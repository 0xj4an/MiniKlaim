import { describe, expect, it } from "vitest";
import { claimAllNonce } from "./claimAllVoucher";

const RUN_A = "01J8Z0A0000000000000000001";
const RUN_B = "01J8Z0A0000000000000000002";

describe("claimAllNonce", () => {
  it("is stable for the same run and badge set", () => {
    expect(claimAllNonce(RUN_A, [1n, 2n])).toBe(claimAllNonce(RUN_A, [1n, 2n]));
  });

  it("ignores the order badges arrive in", () => {
    expect(claimAllNonce(RUN_A, [2n, 1n])).toBe(claimAllNonce(RUN_A, [1n, 2n]));
  });

  it("changes when the run changes", () => {
    expect(claimAllNonce(RUN_B, [1n, 2n])).not.toBe(
      claimAllNonce(RUN_A, [1n, 2n]),
    );
  });

  it("changes when a badge is added", () => {
    expect(claimAllNonce(RUN_A, [1n, 2n, 3n])).not.toBe(
      claimAllNonce(RUN_A, [1n, 2n]),
    );
  });

  it("distinguishes no badges from some badges", () => {
    expect(claimAllNonce(RUN_A, [])).not.toBe(claimAllNonce(RUN_A, [1n]));
  });

  it("is stable with no badges", () => {
    expect(claimAllNonce(RUN_A, [])).toBe(claimAllNonce(RUN_A, []));
  });

  it("does not collide with a run id that contains the separator", () => {
    // "a" + ":" + "1" must not hash the same as "a:1" + ":" + "" .
    expect(claimAllNonce("a", [1n])).not.toBe(claimAllNonce("a:1", []));
  });

  it("fits in uint256", () => {
    const n = claimAllNonce(RUN_A, [1n, 2n]);
    expect(n).toBeGreaterThanOrEqual(0n);
    expect(n).toBeLessThan(2n ** 256n);
  });
});
