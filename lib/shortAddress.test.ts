import { describe, expect, it } from "vitest";
import { shortAddress } from "./shortAddress";

describe("shortAddress", () => {
  it("keeps 0x, six characters, and the last six", () => {
    expect(shortAddress("0x8f51dc0791cddddce08052fff939eb7cf0c17856")).toBe(
      "0x8f51dc…c17856",
    );
  });

  it("leaves a short string alone", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
  });
});
