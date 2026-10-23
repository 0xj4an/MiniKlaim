import { describe, expect, it, vi } from "vitest";
import { createReporter, endpointLabel, REPORTS_PER_KEY } from "./sentryReport";

describe("createReporter", () => {
  it("reports a 5xx grouped by endpoint and status", () => {
    const capture = vi.fn();
    const r = createReporter(capture);
    expect(r.serverError("/api/hexes", 504)).toBe(true);
    expect(capture).toHaveBeenCalledWith("HTTP 504 from /api/hexes", {
      level: "warning",
      tags: { endpoint: "/api/hexes", status: "504", source: "client-fetch" },
      fingerprint: ["http-5xx", "/api/hexes", "504"],
    });
  });

  it("ignores statuses below 500", () => {
    const capture = vi.fn();
    const r = createReporter(capture);
    expect(r.serverError("/api/hexes", 429)).toBe(false);
    expect(r.serverError("/api/runs/:id/claim", 409)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it("caps reports per key and session", () => {
    const capture = vi.fn();
    const r = createReporter(capture);
    for (let i = 0; i < REPORTS_PER_KEY + 5; i++) r.serverError("/api/hexes", 504);
    r.serverError("/api/hexes", 502);
    expect(capture).toHaveBeenCalledTimes(REPORTS_PER_KEY + 1);
  });

  it("reports a WebGL failure once per path", () => {
    const capture = vi.fn();
    const r = createReporter(capture);
    r.webglFailed("/run");
    expect(capture.mock.calls.at(0)?.at(1)).toMatchObject({
      fingerprint: ["map-webgl-failed", "/run"],
    });
  });
});

describe("endpointLabel", () => {
  it("replaces ids and drops the query", () => {
    expect(endpointLabel("/api/runs/3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90/claim")).toBe(
      "/api/runs/:id/claim",
    );
    expect(endpointLabel("/api/hexes?near=8c2a306638783ff&k=40")).toBe("/api/hexes");
    expect(
      endpointLabel("/api/users/0x2bba6b6077304dd0719b1f6348da8f9719a8a4c8/badges"),
    ).toBe("/api/users/:id/badges");
  });
});
