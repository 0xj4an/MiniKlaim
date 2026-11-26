import { describe, expect, it } from "vitest";
import {
  mintFailureFingerprint,
  mintFailureKind,
  mintFailureTitle,
  shouldReportMintFailure,
  affordableCount,
  batchWithinFunds,
} from "./mintFailure";

// The wallet's own words, copied from real events rather than invented, so a
// change to the matching cannot quietly stop recognising what production
// actually sends.
const PERMISSION_DENIED = new Error(
  "Permission denied An unknown RPC error occurred.\n\nRequest Arguments:\n  chain:  Celo (id: 42220)\n  from:   0xB0d0b5D4Af874B5ad4E3683F4C479e1503e108f4\n  to:     0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B",
);
const NO_FEE = new Error(
  "insufficient fee-currency balance: required 330296542098899832, available 1986000000000000",
);
const WALLET_INTERNAL = new Error("Internal error");

describe("mintFailureKind", () => {
  it("names the wallet's refusal", () => {
    expect(mintFailureKind(PERMISSION_DENIED)).toBe("permission_denied");
  });

  it("names a player who cannot pay the fee", () => {
    expect(mintFailureKind(NO_FEE)).toBe("no_fee");
  });

  it("names a wallet that threw from inside itself", () => {
    expect(mintFailureKind(WALLET_INTERNAL)).toBe("wallet_internal");
  });

  it("falls back to tx for anything it does not recognise", () => {
    expect(mintFailureKind(new Error("execution reverted"))).toBe("tx");
    expect(mintFailureKind(null)).toBe("tx");
  });

  it("checks the fee before the refusal", () => {
    // A node can refuse a fee currency and say both things at once. The
    // balance is the one the player can act on, so it wins.
    expect(
      mintFailureKind(
        new Error("Permission denied: insufficient fee-currency balance"),
      ),
    ).toBe("no_fee");
  });
});

describe("shouldReportMintFailure", () => {
  it("keeps a player's empty balance out of Sentry", () => {
    // The price is on the button before they tap and the screen says the
    // balance is short. Paging on it buried the real failures once already.
    expect(shouldReportMintFailure("no_fee")).toBe(false);
  });

  it("reports everything else, the rare refusal included", () => {
    expect(shouldReportMintFailure("permission_denied")).toBe(true);
    expect(shouldReportMintFailure("wallet_internal")).toBe(true);
    expect(shouldReportMintFailure("tx")).toBe(true);
  });
});

describe("mintFailureFingerprint", () => {
  it("gives every kind its own issue", () => {
    const kinds = ["permission_denied", "wallet_internal", "tx"] as const;
    const seen = kinds.map((k) => mintFailureFingerprint(k).join("|"));
    expect(new Set(seen).size).toBe(kinds.length);
  });

  it("carries nothing that varies per event", () => {
    // An address or an amount in the fingerprint would split one fault into
    // one issue per player, which is the opposite failure.
    const fp = mintFailureFingerprint("permission_denied").join("|");
    expect(fp).not.toMatch(/0x|\d{6}/);
  });
});

describe("mintFailureTitle", () => {
  it("says what happened instead of naming a minified function", () => {
    expect(mintFailureTitle("permission_denied")).toContain("wallet");
    expect(mintFailureTitle("tx")).toContain("tx");
    // The old issue was titled `Module.T`, which is why this exists.
    for (const k of ["permission_denied", "wallet_internal", "tx"] as const) {
      expect(mintFailureTitle(k)).not.toMatch(/^Module\./);
    }
  });
});

describe("affordableCount", () => {
  const refusal =
    "insufficient fee-currency balance: required 253979679387217500, available 143304000000000000 for sender 0xabc";

  it("sizes a batch the balance covers, with room to spare", () => {
    // 700 x 0.1433 / 0.2540 = 394 at the same price; 80% of that.
    expect(affordableCount(refusal, 700)).toBe(315);
  });

  it("offers nothing when the message has no figures", () => {
    expect(affordableCount("insufficient funds for gas", 700)).toBeNull();
  });

  it("offers nothing when not even one block fits or nothing is short", () => {
    expect(affordableCount("required 1000, available 1", 5)).toBeNull();
    expect(affordableCount("required 100, available 100", 700)).toBeNull();
    expect(affordableCount(refusal, 1)).toBeNull();
  });
});

describe("batchWithinFunds", () => {
  it("keeps the whole batch when the balance covers the quote", () => {
    expect(batchWithinFunds(700, 0.32, 0.5)).toBe(700);
    expect(batchWithinFunds(700, 0.32, 0.32)).toBe(700);
  });

  it("sizes the batch down to the balance, with room to spare", () => {
    // 26 Nov 2026: 0.143 held against a 0.32 quote for 700.
    expect(batchWithinFunds(700, 0.32, 0.143)).toBe(250);
  });

  it("offers nothing to a wallet that cannot pay for one", () => {
    expect(batchWithinFunds(700, 0.32, 0)).toBe(0);
    expect(batchWithinFunds(700, 0.32, 0.0001)).toBe(0);
  });

  it("does not block a mint when the price or the balance is unknown", () => {
    expect(batchWithinFunds(700, null, 0)).toBe(700);
    expect(batchWithinFunds(700, 0.32, null)).toBe(700);
  });
});
