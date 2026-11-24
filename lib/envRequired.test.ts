import { describe, expect, it, vi } from "vitest";
import { missingServerEnv, reportMissingEnv } from "./envRequired";

const required = [
  { name: "A_KEY", feature: "a" },
  { name: "B_KEY", feature: "b" },
];

describe("missingServerEnv", () => {
  it("lists what is unset, empty or blank", () => {
    expect(missingServerEnv({ A_KEY: "x", B_KEY: "  " }, required)).toEqual([
      { name: "B_KEY", feature: "b" },
    ]);
    expect(missingServerEnv({}, required)).toHaveLength(2);
    expect(missingServerEnv({ A_KEY: "x", B_KEY: "y" }, required)).toEqual([]);
  });
});

describe("reportMissingEnv", () => {
  it("logs one error per missing setting and never a value", () => {
    const error = vi.fn();
    const missing = reportMissingEnv({ error }, { DATABASE_URL: "postgres://secret" });
    expect(missing.map((m) => m.name)).toContain("GEOAPIFY_API_KEY");
    expect(missing.map((m) => m.name)).not.toContain("DATABASE_URL");
    expect(error).toHaveBeenCalledTimes(missing.length);
    expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
  });
});
