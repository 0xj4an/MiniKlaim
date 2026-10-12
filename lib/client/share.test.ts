import { describe, expect, it } from "vitest";
import { shareIntentUrl } from "@/lib/client/share";

describe("shareIntentUrl", () => {
  it("builds the X intent with text and url", () => {
    expect(
      shareIntentUrl("x", "I captured 5 blocks", "https://miniklaim.fun/p/a"),
    ).toBe(
      "https://x.com/intent/post?text=I%20captured%205%20blocks&url=https%3A%2F%2Fminiklaim.fun%2Fp%2Fa",
    );
  });
  it("builds the Facebook sharer", () => {
    expect(shareIntentUrl("facebook", "hi", "https://miniklaim.fun")).toContain(
      "facebook.com/sharer/sharer.php?u=https%3A%2F%2Fminiklaim.fun",
    );
  });
});
