import { describe, expect, it } from "vitest";
import {
  sponsorRefusalFor,
  sponsorWantsPlayerToPay,
} from "./sponsorOutcome";

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

describe("sponsorWantsPlayerToPay", () => {
  it("hands over when the relayer declines, caps, or fails", () => {
    // 402: below the claim floor and the player can pay. 429: this wallet is
    // past today's 1,000-block allowance. 503: the relayer tx failed.
    expect(sponsorWantsPlayerToPay(402)).toBe(true);
    expect(sponsorWantsPlayerToPay(429)).toBe(true);
    expect(sponsorWantsPlayerToPay(503)).toBe(true);
  });

  it("does not hand over a run this browser cannot prove", () => {
    // 403 is a missing run token, and the voucher the player's own tx needs
    // is gated on the same token, so there is nothing to hand over to.
    expect(sponsorWantsPlayerToPay(403)).toBe(false);
  });

  it("leaves success and the unexpected alone", () => {
    for (const s of [200, 201, 400, 404, 409, 500]) {
      expect(sponsorWantsPlayerToPay(s)).toBe(false);
    }
  });
});
