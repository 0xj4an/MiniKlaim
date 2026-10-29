import { describe, expect, it, vi } from "vitest";
import { findEnvSkew, reportEnvSkew } from "@/lib/envSkew";

describe("findEnvSkew", () => {
  // The 29 Oct case: on in the container, absent from the build.
  it("catches a flag set at runtime but not at build", () => {
    expect(
      findEnvSkew([{ name: "NEXT_PUBLIC_HEX_STRENGTH", baked: undefined }], {
        NEXT_PUBLIC_HEX_STRENGTH: "on",
      }),
    ).toEqual([
      { name: "NEXT_PUBLIC_HEX_STRENGTH", baked: "", runtime: "on" },
    ]);
  });

  it("catches the reverse, baked but dropped from the runtime env", () => {
    const skew = findEnvSkew([{ name: "NEXT_PUBLIC_X", baked: "1" }], {});
    expect(skew).toEqual([{ name: "NEXT_PUBLIC_X", baked: "1", runtime: "" }]);
  });

  it("says nothing when they agree", () => {
    expect(
      findEnvSkew([{ name: "NEXT_PUBLIC_X", baked: "on" }], {
        NEXT_PUBLIC_X: "on",
      }),
    ).toEqual([]);
  });

  // Unset and empty are the same state; whitespace is not a difference.
  it("treats unset, empty and padded as equal", () => {
    expect(findEnvSkew([{ name: "A", baked: undefined }], { A: "" })).toEqual([]);
    expect(findEnvSkew([{ name: "A", baked: "" }], {})).toEqual([]);
    expect(findEnvSkew([{ name: "A", baked: " on " }], { A: "on" })).toEqual([]);
  });
});

describe("reportEnvSkew", () => {
  it("logs one error per skewed variable", () => {
    const log = { error: vi.fn() };
    const skew = reportEnvSkew(log, { NEXT_PUBLIC_HEX_STRENGTH: "on" });
    expect(skew.some((s) => s.name === "NEXT_PUBLIC_HEX_STRENGTH")).toBe(true);
    expect(log.error).toHaveBeenCalled();
  });

  it("does not print the attribution code, only whether it is set", () => {
    const log = { error: vi.fn() };
    reportEnvSkew(log, { NEXT_PUBLIC_CELO_ATTRIBUTION_CODE: "celo_secret1" });
    const call = log.error.mock.calls.find((c) =>
      String(c[0]).includes("ATTRIBUTION"),
    );
    expect(JSON.stringify(call?.[1])).not.toContain("celo_secret1");
    expect(JSON.stringify(call?.[1])).toContain("set");
  });
});
