import { describe, expect, it, vi } from "vitest";
import {
  addToOwners,
  expandOwners,
  groupByOwner,
  ownersJson,
  rowsFromWorldResponse,
  type WorldOwnerGroup,
} from "./worldHexes";

const rows = [
  { h3: "a", owner: "0x1", ownerUsername: "ana" },
  { h3: "b", owner: "0x2", ownerUsername: null },
  { h3: "c", owner: "0x1", ownerUsername: "ana" },
];

describe("world hexes grouping", () => {
  it("round-trips rows through owner groups", () => {
    const groups = groupByOwner(rows);
    expect(groups).toEqual([
      { owner: "0x1", ownerUsername: "ana", h3: ["a", "c"] },
      { owner: "0x2", ownerUsername: null, h3: ["b"] },
    ]);
    expect(expandOwners(groups)).toHaveLength(3);
  });
  it("reads both response shapes", () => {
    expect(rowsFromWorldResponse({ hexes: rows })).toEqual(rows);
    expect(rowsFromWorldResponse({ owners: groupByOwner(rows) })).toHaveLength(3);
    expect(rowsFromWorldResponse({})).toEqual([]);
  });
});

describe("addToOwners", () => {
  it("groups a list that arrives in slices the same as one that arrives whole", () => {
    const groups = new Map<string, WorldOwnerGroup>();
    addToOwners(groups, rows.slice(0, 1));
    addToOwners(groups, rows.slice(1));
    expect([...groups.values()]).toEqual(groupByOwner(rows));
  });
});

describe("ownersJson", () => {
  const big: WorldOwnerGroup[] = Array.from({ length: 40 }, (_, o) => ({
    owner: `0x${o.toString(16).padStart(40, "0")}`,
    // Names that need escaping: the text must still be what stringify gives.
    ownerUsername: o % 3 === 0 ? null : `na"me\\${o}\u00e9`,
    h3: Array.from({ length: 700 }, (_, i) => `8c${o}${i}ff`),
  }));

  it("is byte for byte what JSON.stringify gives", async () => {
    expect(await ownersJson(big)).toBe(JSON.stringify({ owners: big }));
  });

  it("carries the extra numbers after the list, as the thinned list needs", async () => {
    expect(await ownersJson(big.slice(0, 2), { total: 498906 })).toBe(
      JSON.stringify({ owners: big.slice(0, 2), total: 498906 }),
    );
  });

  it("writes an empty world", async () => {
    expect(await ownersJson([])).toBe('{"owners":[]}');
    expect(await ownersJson([], { total: 0 })).toBe('{"owners":[],"total":0}');
  });

  // The point of the function: one stringify over the world list held the
  // process for 135 ms on an idle machine. 28,000 ids must not be one hold.
  it("hands the process back while it writes a large list", async () => {
    const spy = vi.spyOn(globalThis, "setImmediate");
    await ownersJson(big);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(5);
    spy.mockRestore();
  });

  it("does not pause for a list too small to matter", async () => {
    const spy = vi.spyOn(globalThis, "setImmediate");
    await ownersJson(big.slice(0, 2));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
