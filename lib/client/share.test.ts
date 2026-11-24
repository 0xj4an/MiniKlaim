import { describe, expect, it } from "vitest";
import { mentionsUs, shareIntentUrl } from "@/lib/client/share";

describe("shareIntentUrl", () => {
  it("builds the X intent with text and url", () => {
    expect(
      shareIntentUrl(
        "x",
        "I captured 5 blocks on @MiniKlaim.",
        "https://miniklaim.fun/p/a",
      ),
    ).toBe(
      "https://x.com/intent/post?text=I%20captured%205%20blocks%20on%20%40MiniKlaim.&url=https%3A%2F%2Fminiklaim.fun%2Fp%2Fa",
    );
  });
  it("adds via @MiniKlaim to a caption that does not mention the game", () => {
    expect(
      shareIntentUrl("x", "I captured 5 blocks", "https://miniklaim.fun/p/a"),
    ).toBe(
      "https://x.com/intent/post?text=I%20captured%205%20blocks&url=https%3A%2F%2Fminiklaim.fun%2Fp%2Fa&via=MiniKlaim",
    );
  });
  it("finds the mention whatever its case, and not inside another handle", () => {
    expect(mentionsUs("on @miniklaim.")).toBe(true);
    expect(mentionsUs("on @MiniKlaim")).toBe(true);
    expect(mentionsUs("on MiniKlaim")).toBe(false);
    expect(mentionsUs("on @MiniKlaimFans")).toBe(false);
  });
  it("builds the Facebook sharer", () => {
    expect(shareIntentUrl("facebook", "hi", "https://miniklaim.fun")).toContain(
      "facebook.com/sharer/sharer.php?u=https%3A%2F%2Fminiklaim.fun",
    );
  });
});
