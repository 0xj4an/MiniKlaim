import { describe, expect, it } from "vitest";
import { sponsorRefusalFor } from "./sponsorOutcome";

describe("sponsorRefusalFor", () => {
  it("treats a player who can pay as a refusal, not a failure", () => {
    expect(sponsorRefusalFor(402)).toBe("refused");
  });

  it("treats the daily cap as a failed claim", () => {
    expect(sponsorRefusalFor(429)).toBe("failed");
  });

  it("treats a missing run token as a failed claim, never an error", () => {
    // A run played in another browser, or local storage cleared. Nothing to
    // fix from a report, so this must not reach Sentry.
    expect(sponsorRefusalFor(403)).toBe("failed");
  });

  it("leaves real server failures to the caller", () => {
    for (const status of [500, 502, 503, 504, 409, 404]) {
      expect(sponsorRefusalFor(status)).toBeNull();
    }
  });
});
