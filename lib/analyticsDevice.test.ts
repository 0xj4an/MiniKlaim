import { describe, expect, it } from "vitest";
import { isConstrainedDevice } from "@/lib/analytics";

describe("isConstrainedDevice", () => {
  it("flags 2 GB phones and data saver", () => {
    expect(
      isConstrainedDevice({ deviceMemory: 2, hardwareConcurrency: 8 }),
    ).toBe(true);
    expect(isConstrainedDevice({ connection: { saveData: true } })).toBe(true);
  });
  it("leaves capable phones and unknown browsers alone", () => {
    expect(
      isConstrainedDevice({ deviceMemory: 4, hardwareConcurrency: 8 }),
    ).toBe(false);
    expect(isConstrainedDevice({})).toBe(false);
    expect(isConstrainedDevice(null)).toBe(false);
  });
});
