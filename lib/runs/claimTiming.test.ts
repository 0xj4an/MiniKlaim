import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { phaseTimer, watchClaim } from "./claimTiming";

describe("phaseTimer", () => {
  it("records each step and the last one finished", () => {
    let t = 0;
    const timing = phaseTimer(() => t);
    expect(timing.lastMark()).toBe("start");
    t = 120;
    timing.mark("body+run");
    t = 500;
    timing.mark("guard");
    expect(timing.phases()).toEqual({ "body+run": 120, guard: 380 });
    expect(timing.lastMark()).toBe("guard");
    expect(timing.total()).toBe(500);
  });
});

describe("watchClaim", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("logs while the request is still running, naming the step it is past", () => {
    const warn = vi.fn();
    const timing = phaseTimer();
    timing.mark("body+run");
    const stop = watchClaim(timing, "run-1", warn);
    vi.advanceTimersByTime(9_999);
    expect(warn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe("claim batch still running");
    expect(warn.mock.calls[0][1]).toMatchObject({ runId: "run-1", after: "body+run" });
    vi.advanceTimersByTime(15_000);
    expect(warn).toHaveBeenCalledTimes(2);
    stop();
  });

  it("stays quiet for a request that ends in time", () => {
    const warn = vi.fn();
    const stop = watchClaim(phaseTimer(), "run-2", warn);
    vi.advanceTimersByTime(3_000);
    stop();
    vi.advanceTimersByTime(60_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs once when the client hangs up, and not after the request ended", () => {
    const warn = vi.fn();
    const gone = new AbortController();
    const stop = watchClaim(phaseTimer(), "run-3", warn, gone.signal);
    gone.abort();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toBe("claim batch client gone");
    stop();

    const warn2 = vi.fn();
    const late = new AbortController();
    watchClaim(phaseTimer(), "run-4", warn2, late.signal)();
    late.abort();
    expect(warn2).not.toHaveBeenCalled();
  });
});
