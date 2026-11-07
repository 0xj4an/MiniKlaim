import { describe, expect, it } from "vitest";
import { describeEntryError, entryFailureFingerprint } from "@/lib/challenges/entryFailure";

describe("describeEntryError", () => {
  it("keeps the wallet's code and detail from the whole chain", () => {
    const inner = Object.assign(new Error("Permission denied"), { code: -32604, name: "RpcError" });
    const outer = Object.assign(new Error("An unknown RPC error occurred."), {
      name: "UnknownRpcError",
      shortMessage: "An unknown RPC error occurred.",
      details: "Permission denied",
      cause: inner,
    });
    const d = describeEntryError(outer);
    expect(d.kind).toBe("permission_denied");
    expect(d.code).toBe("-32604");
    expect(d.details).toBe("Permission denied");
    expect(d.causes).toHaveLength(2);
    expect(d.causes[1]).toContain("code=-32604");
  });

  it("survives a non-error", () => {
    expect(describeEntryError("boom")).toMatchObject({ kind: "tx", code: null, causes: [] });
  });

  it("groups by kind only", () => {
    expect(entryFailureFingerprint("permission_denied")).toEqual(["challenge-enter-failed", "permission_denied"]);
  });
});
