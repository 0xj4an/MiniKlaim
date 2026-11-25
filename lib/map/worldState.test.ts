import { latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import type { ClaimedHexRow } from "@/lib/map/claimedView";
import { groupByOwner } from "@/lib/map/worldHexes";
import { thinToParents } from "@/lib/map/worldThin";
import { applyRows, createWorldState, viewOf } from "./worldState";

const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const C = "0x00000000000000000000000000000000000000c3";
const none = () => Promise.resolve();

/** A spread of real blocks over several parent cells, three owners. */
function world(n: number): ClaimedHexRow[] {
  const rows: ClaimedHexRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const h3 = latLngToCell(6.2 + (i % 40) * 0.02, -75.6 + Math.floor(i / 40) * 0.03, 12);
    if (seen.has(h3)) continue;
    seen.add(h3);
    rows.push({ h3, owner: [A, B, C][i % 3], ownerUsername: null });
  }
  return rows;
}

const byId = (rows: ClaimedHexRow[]) =>
  rows.map((r) => `${r.h3}:${r.owner}`).sort();

describe("world state", () => {
  it("counts only rows that change something", () => {
    const state = createWorldState(4);
    const rows = world(300);
    expect(applyRows(state, rows)).toBe(rows.length);
    expect(state.size).toBe(rows.length);
    // The same rows again: the overlap every refresh re-reads.
    expect(applyRows(state, rows)).toBe(0);
    // A steal changes one block and adds none.
    expect(applyRows(state, [{ h3: rows[0].h3, owner: C }])).toBe(
      rows[0].owner === C ? 0 : 1,
    );
    expect(state.size).toBe(rows.length);
  });

  it("thins to the same winners as thinning the whole table", async () => {
    const rows = world(1200);
    const rank = (owner: string) => (owner === B ? 1 : 0);
    const state = createWorldState(4);
    // Fed in two halves and out of order, as changes arrive.
    applyRows(state, rows.slice(600).reverse());
    applyRows(state, rows.slice(0, 600));
    const view = await viewOf(state, rank, none);
    expect(view.finest).toEqual(thinToParents(rows, 4, rank));
  });

  it("follows a steal: the new owner holds the block and can win the cell", async () => {
    const rows = world(900);
    const rank = (owner: string) => (owner === B ? 1 : 0);
    const state = createWorldState(4);
    applyRows(state, rows);
    const stolen = rows.map((r, i) => (i % 7 === 0 ? { ...r, owner: B } : r));
    applyRows(state, stolen.filter((_, i) => i % 7 === 0));
    const view = await viewOf(state, rank, none);
    expect(view.finest).toEqual(thinToParents(stolen, 4, rank));
    const got = [...view.groups.values()].flatMap((g) =>
      g.h3.map((h3) => ({ h3, owner: g.owner, ownerUsername: null })),
    );
    const want = groupByOwner(stolen).flatMap((g) =>
      g.h3.map((h3) => ({ h3, owner: g.owner, ownerUsername: null })),
    );
    expect(byId(got)).toEqual(byId(want));
  });

  it("keeps a malformed id under its owner and out of the dots", async () => {
    const state = createWorldState(4);
    const good = world(3);
    applyRows(state, [...good, { h3: "not-a-cell", owner: A }]);
    const view = await viewOf(state, () => 0, none);
    expect(state.size).toBe(good.length + 1);
    expect(view.groups.get(A)?.h3).toContain("not-a-cell");
    expect(view.finest.some((r) => r.h3 === "not-a-cell")).toBe(false);
  });

  it("hands the process back while it walks", async () => {
    const state = createWorldState(4);
    const rows: { h3: string; owner: string }[] = [];
    for (let i = 0; i < 25_000; i++) {
      rows.push({ h3: latLngToCell(-34 + i * 0.0004, 18.4, 12), owner: A });
    }
    applyRows(state, rows);
    let breaths = 0;
    await viewOf(state, () => 0, async () => {
      breaths += 1;
    });
    expect(breaths).toBeGreaterThan(0);
  });
});
