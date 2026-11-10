import { describe, expect, it } from "vitest";
import { captureStatus } from "./captureStatus";

const base = {
  pending: 0,
  saved: 0,
  acted: 0,
  repeated: 0,
  fixReady: true,
  startedOnOwned: false,
};

describe("captureStatus", () => {
  it("says the GPS is not ready before anything else can happen", () => {
    expect(captureStatus({ ...base, fixReady: false })).toEqual({
      kind: "searching",
    });
  });

  it("says ready once a good fix arrives and nothing is captured yet", () => {
    expect(captureStatus(base)).toEqual({ kind: "ready" });
  });

  it("explains a start on a block the player already owns", () => {
    expect(captureStatus({ ...base, startedOnOwned: true })).toEqual({
      kind: "owned",
    });
  });

  it("does not blame an owned block while the GPS is still missing", () => {
    expect(
      captureStatus({ ...base, fixReady: false, startedOnOwned: true }),
    ).toEqual({ kind: "searching" });
  });

  it("shows blocks on their way before the saved total", () => {
    expect(captureStatus({ ...base, pending: 2, saved: 5 })).toEqual({
      kind: "saving",
      count: 2,
    });
  });

  it("shows the saved total once the queue is empty", () => {
    expect(captureStatus({ ...base, saved: 5 })).toEqual({
      kind: "saved",
      count: 5,
    });
  });

  it("says a reinforce or an attack happened when no block is new", () => {
    expect(captureStatus({ ...base, acted: 1 })).toEqual({ kind: "acted" });
  });

  it("explains a pass the daily limit swallowed", () => {
    expect(captureStatus({ ...base, repeated: 1 })).toEqual({ kind: "repeat" });
  });

  it("prefers what worked over what the daily limit swallowed", () => {
    expect(captureStatus({ ...base, acted: 1, repeated: 3 })).toEqual({
      kind: "acted",
    });
  });

  it("keeps showing saved blocks through a weak signal", () => {
    expect(captureStatus({ ...base, saved: 3, fixReady: false })).toEqual({
      kind: "saved",
      count: 3,
    });
  });
});
