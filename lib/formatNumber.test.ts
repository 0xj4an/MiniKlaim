import { describe, expect, it } from "vitest";
import { groupNumber } from "./formatNumber";

describe("grouped counts", () => {
  it("groups four digits in Spanish, which the default does not", () => {
    expect(groupNumber(4001, "es")).toBe("4.001");
    expect(groupNumber(27044, "es")).toBe("27.044");
  });
  it("groups in English", () => {
    expect(groupNumber(4001, "en")).toBe("4,001");
    expect(groupNumber(1234567, "en")).toBe("1,234,567");
  });
  it("leaves small counts alone", () => {
    expect(groupNumber(0, "es")).toBe("0");
    expect(groupNumber(213, "en")).toBe("213");
  });
});
