import { fromDataSuffix } from "@celo/attribution-tags";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CALLDATA = "0xa9059cbb0000000000000000000000000000000000000000000000000000000000000001";
// A made-up code in the registry's format; the real one lives in the env.
const CODE = "celo_test1234";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withAttribution", () => {
  it("appends a Schema 0 suffix carrying the env code", async () => {
    vi.stubEnv("NEXT_PUBLIC_CELO_ATTRIBUTION_CODE", CODE);
    const { withAttribution } = await import("./attribution");
    const tagged = withAttribution(CALLDATA);
    expect(tagged.startsWith(CALLDATA)).toBe(true);
    expect(fromDataSuffix(tagged)).toEqual({ codes: [CODE], schemaId: 0 });
  });

  it("leaves calldata untouched when no code is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_CELO_ATTRIBUTION_CODE", "");
    const { withAttribution } = await import("./attribution");
    expect(withAttribution(CALLDATA)).toBe(CALLDATA);
  });

  it("leaves calldata untouched when the code is invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_CELO_ATTRIBUTION_CODE", "Not Valid!");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { withAttribution } = await import("./attribution");
    expect(withAttribution(CALLDATA)).toBe(CALLDATA);
  });
});
