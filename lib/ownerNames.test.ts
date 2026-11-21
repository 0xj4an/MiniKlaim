import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { ownerNameMap, withOwnerNames } from "./ownerNames";

describe("withOwnerNames", () => {
  it("asks once for each distinct owner and fills names", async () => {
    const load = vi.fn(async (a: string[]) =>
      a.map((address) => ({
        address,
        username: address === "0xa" ? "ana" : null,
      })),
    );
    const out = await withOwnerNames(
      [
        { h3: "1", owner: "0xa" },
        { h3: "2", owner: "0xa" },
        { h3: "3", owner: "0xb" },
        { h3: "4", owner: null },
      ],
      load,
    );
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0].sort()).toEqual(["0xa", "0xb"]);
    expect(out.map((r) => r.ownerUsername)).toEqual(["ana", "ana", null, null]);
    expect(out[0]).toMatchObject({ h3: "1", owner: "0xa" });
  });

  it("does not query for an empty list", async () => {
    const load = vi.fn();
    expect(await withOwnerNames([], load)).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("ownerNameMap", () => {
  it("asks in chunks, once per distinct owner", async () => {
    const owners = Array.from({ length: 2_300 }, (_, i) => `0x${i}`);
    const load = vi.fn(async (a: string[]) =>
      a.map((address) => ({ address, username: address === "0x7" ? "seven" : null })),
    );
    const names = await ownerNameMap([...owners, "0x7", "0x8"], load);
    expect(load.mock.calls.map((c) => c[0].length)).toEqual([1_000, 1_000, 300]);
    expect(names.get("0x7")).toBe("seven");
    expect(names.get("0x8")).toBeNull();
    expect(names.has("0xmissing")).toBe(false);
  });

  it("does not query for no owners", async () => {
    const load = vi.fn();
    expect((await ownerNameMap([], load)).size).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });
});
