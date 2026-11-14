import { describe, expect, test } from "vitest";
import { buildDiffers, claimReload } from "@/lib/runs/staleClient";

const A = "1217175a389f5d1796fda605c08aa648ec9e1109";
const B = "72299de04cb65239f34ae58ed3fe3ace6dd3db42";

describe("buildDiffers", () => {
  test("a tab on the live build is not stale", () => {
    expect(buildDiffers(A, A)).toBe(false);
  });
  test("a tab on an older build is", () => {
    expect(buildDiffers(A, B)).toBe(true);
  });
  test("not knowing either side is not a reason to reload", () => {
    expect(buildDiffers(undefined, B)).toBe(false);
    expect(buildDiffers(A, null)).toBe(false);
    expect(buildDiffers("dev", B)).toBe(false);
    expect(buildDiffers(A, "")).toBe(false);
  });
});

describe("claimReload", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  test("reloads once for a build, and not again", () => {
    const s = store();
    expect(claimReload(s, B)).toBe(true);
    expect(claimReload(s, B)).toBe(false);
  });
  test("a later build may reload again", () => {
    const s = store();
    expect(claimReload(s, A)).toBe(true);
    expect(claimReload(s, B)).toBe(true);
  });
  test("no storage, no reload: it could not be told from a loop", () => {
    expect(claimReload(null, B)).toBe(false);
    expect(
      claimReload({ getItem: () => { throw new Error("blocked"); }, setItem: () => {} }, B),
    ).toBe(false);
  });
});
