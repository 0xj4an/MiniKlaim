import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { withOwnerNames } from "./ownerNames";

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
