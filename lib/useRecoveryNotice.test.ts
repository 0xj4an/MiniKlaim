import { describe, expect, it } from "vitest";
import { affectedByOutage, OUTAGE_AT } from "@/lib/useRecoveryNotice";

const before = new Date(OUTAGE_AT - 86_400_000).toISOString();
const after = new Date(OUTAGE_AT + 86_400_000).toISOString();

describe("affectedByOutage", () => {
  it("is the returning player whose name the outage took", () => {
    expect(affectedByOutage({ username: null, createdAt: before })).toBe(true);
  });

  it("leaves alone a player who still has a name", () => {
    expect(affectedByOutage({ username: "yochabet", createdAt: before })).toBe(
      false,
    );
  });

  // Someone who joined after the outage has no name yet either, and telling
  // them about an outage they never saw would only confuse them.
  it("leaves alone a player who joined afterwards", () => {
    expect(affectedByOutage({ username: null, createdAt: after })).toBe(false);
  });

  it("says nothing when there is no user yet", () => {
    expect(affectedByOutage(null)).toBe(false);
  });

  it("does not guess from an unparseable date", () => {
    expect(affectedByOutage({ username: null, createdAt: "whenever" })).toBe(
      false,
    );
  });
});
