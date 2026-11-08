import { afterEach, describe, expect, it } from "vitest";
import { challengeEntriesPaused } from "./paused";

const KEY = "CHALLENGE_ENTRIES_PAUSED";
afterEach(() => {
  delete process.env[KEY];
});

describe("challengeEntriesPaused", () => {
  it("is off when nothing is set, so a missing variable never pauses the game", () => {
    expect(challengeEntriesPaused()).toBe(false);
  });

  it("accepts the spellings someone editing a compose file would use", () => {
    for (const v of ["1", "true", "TRUE", "on", "yes", " true "]) {
      process.env[KEY] = v;
      expect(challengeEntriesPaused(), v).toBe(true);
    }
  });

  it("treats anything else as not paused", () => {
    // Including "0" and "false", so a variable left behind as off does not
    // quietly keep entries shut.
    for (const v of ["0", "false", "off", "no", ""]) {
      process.env[KEY] = v;
      expect(challengeEntriesPaused(), v).toBe(false);
    }
  });
});
