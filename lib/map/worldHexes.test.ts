import { describe, expect, it } from "vitest";
import { expandOwners, groupByOwner, rowsFromWorldResponse } from "./worldHexes";

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
