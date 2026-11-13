import { describe, expect, it } from "vitest";
import {
  hashOwnerKey,
  newOwnerKey,
  ownerKeyDecision,
  ownerKeyMatches,
} from "./ownerKeyRules";

const none = { hasKey: false, hasUsername: false, hasRuns: false, provenByOldRun: false };

describe("ownerKeyDecision", () => {
  it("gives a key to a wallet that has nothing yet", () => {
    expect(ownerKeyDecision(none)).toBe("fresh");
  });

  it("refuses a wallet that has played, a name or a key, without proof", () => {
    expect(ownerKeyDecision({ ...none, hasRuns: true })).toBe("refused");
    expect(ownerKeyDecision({ ...none, hasUsername: true })).toBe("refused");
    expect(ownerKeyDecision({ ...none, hasKey: true })).toBe("refused");
  });

  it("gives a key, replacing any old one, to a phone holding an old run's token", () => {
    expect(
      ownerKeyDecision({ hasKey: true, hasUsername: true, hasRuns: true, provenByOldRun: true }),
    ).toBe("proven");
  });
});

describe("ownerKeyMatches", () => {
  it("accepts the key whose hash is stored and nothing else", () => {
    const key = newOwnerKey();
    const stored = hashOwnerKey(key);
    expect(ownerKeyMatches(stored, key)).toBe(true);
    expect(ownerKeyMatches(stored, newOwnerKey())).toBe(false);
    expect(ownerKeyMatches(stored, "")).toBe(false);
    expect(ownerKeyMatches(stored, null)).toBe(false);
    expect(ownerKeyMatches(null, key)).toBe(false);
  });

  it("makes a different key every time", () => {
    expect(newOwnerKey()).not.toBe(newOwnerKey());
  });
});
