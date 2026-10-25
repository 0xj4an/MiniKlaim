import { beforeEach, describe, expect, it } from "vitest";
import {
  LIMITED_EVENTS_PER_SESSION,
  resetLimitedEvents,
  takeLimitedSlot,
} from "./analytics";

beforeEach(() => {
  resetLimitedEvents();
});

describe("takeLimitedSlot", () => {
  it("grants the limit per key and marks the last slot as capped", () => {
    const slots = Array.from({ length: LIMITED_EVENTS_PER_SESSION + 3 }, () =>
      takeLimitedSlot("hexes_refresh_network_error"),
    );
    expect(slots.filter((s) => s.send)).toHaveLength(LIMITED_EVENTS_PER_SESSION);
    expect(slots[LIMITED_EVENTS_PER_SESSION - 1]).toEqual({ send: true, capped: true });
    expect(slots[0]).toEqual({ send: true, capped: false });
    expect(slots[LIMITED_EVENTS_PER_SESSION]).toEqual({ send: false, capped: false });
  });

  it("counts each key on its own and resets on demand", () => {
    for (let i = 0; i < 5; i++) takeLimitedSlot("batch_claim_network_error", 5);
    expect(takeLimitedSlot("batch_claim_network_error", 5).send).toBe(false);
    expect(takeLimitedSlot("run_start_network_error", 5).send).toBe(true);
    resetLimitedEvents();
    expect(takeLimitedSlot("batch_claim_network_error", 5).send).toBe(true);
  });
});
