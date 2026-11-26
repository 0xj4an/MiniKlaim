import { describe, expect, it } from "vitest";
import { COLD_MAX_S, readiness } from "./drain";

describe("readiness", () => {
  it("is ready once warm and not draining", () => {
    expect(readiness({ draining: false, warm: true, uptimeS: 5 })).toEqual({ ready: true });
  });

  it("waits for the world list on a fresh container", () => {
    expect(readiness({ draining: false, warm: false, uptimeS: 10 })).toEqual({
      ready: false,
      reason: "warming",
    });
  });

  it("lets a container in after the ceiling even if the list never built", () => {
    expect(readiness({ draining: false, warm: false, uptimeS: COLD_MAX_S })).toEqual({
      ready: true,
    });
  });

  it("draining wins over everything", () => {
    expect(readiness({ draining: true, warm: true, uptimeS: 9999 })).toEqual({
      ready: false,
      reason: "draining",
    });
  });
});
