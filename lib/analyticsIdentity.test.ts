import { describe, expect, it } from "vitest";
import { identityAction } from "@/lib/analytics";

const ADDR = "0x2bba6b6077304dd0719b1f6348da8f9719a8a4c8";

describe("identityAction", () => {
  it("identifies a connected wallet", () => {
    expect(identityAction("connected", ADDR, null)).toBe("identify");
  });

  it("keeps the stored identity while wagmi reconnects on page load", () => {
    expect(identityAction("reconnecting", undefined, null)).toBe("none");
    expect(identityAction("connecting", undefined, null)).toBe("none");
    expect(identityAction("disconnected", undefined, null)).toBe("none");
  });

  it("resets only after a wallet identified this session disconnects", () => {
    expect(identityAction("disconnected", undefined, ADDR)).toBe("reset");
  });
});
