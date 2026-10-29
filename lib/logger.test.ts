import { describe, expect, it } from "vitest";
import { resolveMinLevel } from "@/lib/logger";

const DEBUG = 10;
const INFO = 20;
const WARN = 30;

describe("resolveMinLevel", () => {
  it("keeps the old default: quiet in production, everything elsewhere", () => {
    expect(resolveMinLevel(undefined, "production")).toBe(WARN);
    expect(resolveMinLevel(undefined, "development")).toBe(DEBUG);
    expect(resolveMinLevel(undefined, undefined)).toBe(DEBUG);
  });

  // The maintenance jobs run with NODE_ENV=production and report only
  // through log.info, so without this they say nothing at all.
  it("lets a job ask for info while still running as production", () => {
    expect(resolveMinLevel("info", "production")).toBe(INFO);
    expect(resolveMinLevel("INFO", "production")).toBe(INFO);
    expect(resolveMinLevel("  debug  ", "production")).toBe(DEBUG);
  });

  it("falls back to the default when the value is not a level", () => {
    expect(resolveMinLevel("verbose", "production")).toBe(WARN);
    expect(resolveMinLevel("", "production")).toBe(WARN);
  });

  // `named in LEVELS` walks the prototype, so these used to resolve to a
  // function and every later comparison against it was NaN.
  it("does not take a level off Object's prototype", () => {
    for (const key of ["constructor", "tostring", "valueof", "hasownproperty"]) {
      expect(resolveMinLevel(key, "production")).toBe(WARN);
    }
  });
});
