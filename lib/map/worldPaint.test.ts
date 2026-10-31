import { latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import { thinWorldRows, worldPointParentRes } from "./worldPaint";

const medellin = latLngToCell(6.25, -75.57, 12);
const medellinNext = latLngToCell(6.251, -75.57, 12);
const nyc = latLngToCell(40.71, -74.0, 12);

describe("worldPointParentRes", () => {
  it("uses coarse cells on the planet and real blocks once fills show", () => {
    expect(worldPointParentRes(0)).toBe(2);
    expect(worldPointParentRes(4)).toBe(3);
    expect(worldPointParentRes(7)).toBe(4);
    expect(worldPointParentRes(8)).toBeNull();
  });
});

describe("thinWorldRows", () => {
  const rows = [
    { h3: medellin, owner: "0xgray", ownerUsername: null },
    { h3: medellinNext, owner: "0xmine", ownerUsername: "me" },
    { h3: nyc, owner: "0xnyc", ownerUsername: null },
  ];

  it("keeps one dot per parent and prefers the higher rank", () => {
    const thinned = thinWorldRows(rows, 2, (owner) => (owner === "0xmine" ? 2 : 0));
    expect(thinned).toHaveLength(2);
    const kept = thinned.find((row) => row.owner === "0xmine");
    expect(kept?.ownerUsername).toBe("me");
    expect(kept?.h3).not.toBe(medellin);
  });
});
