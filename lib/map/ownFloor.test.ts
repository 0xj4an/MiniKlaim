import { describe, expect, it } from "vitest";
import type { ClaimedHexRow } from "./claimedView";
import { forgetSettled, withOwnFloor } from "./ownFloor";

const ME = "0xB0d0b5D4Af874B5ad4E3683F4C479e1503e108f4";
const THEM = "0x8f51DC0791CdDDDCE08052FfF939eb7cf0c17856";

function row(h3: string, owner = ME, strength?: number): ClaimedHexRow {
  return { h3, owner, ownerUsername: null, strength };
}

const base = {
  owned: new Set<string>(),
  pending: new Set<string>(),
  address: ME,
  username: "0xj4an",
};

describe("withOwnFloor", () => {
  it("keeps the player's blocks when a refresh forgets them", () => {
    // The bug on film: the refresh answered without the trail and the trail
    // disappeared off the map for 45 seconds.
    const out = withOwnFloor({
      ...base,
      rows: [],
      owned: new Set(["8c2a", "8c2b", "8c2c"]),
    });
    expect(out.map((r) => r.h3).sort()).toEqual(["8c2a", "8c2b", "8c2c"]);
    expect(out.every((r) => r.owner === ME)).toBe(true);
  });

  it("draws what is captured but not yet saved", () => {
    // These were never drawn at all before: the features came only from
    // server rows, so the trail followed the network and not the player.
    const out = withOwnFloor({ ...base, rows: [], pending: new Set(["8cff"]) });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ h3: "8cff", owner: ME, pending: true });
  });

  it("lets the server win on a hex it does mention", () => {
    // A block the player lost must be allowed to change hands. Flooring it
    // would pin a block that is no longer theirs, which is a worse lie than
    // the flicker this fixes.
    const out = withOwnFloor({
      ...base,
      rows: [row("8c2a", THEM, 4)],
      owned: new Set(["8c2a"]),
    });
    expect(out).toHaveLength(1);
    expect(out[0].owner).toBe(THEM);
    expect(out[0].strength).toBe(4);
  });

  it("prefers the server's row over a pending one for the same hex", () => {
    const out = withOwnFloor({
      ...base,
      rows: [row("8c2a", ME, 2)],
      pending: new Set(["8c2a"]),
    });
    expect(out).toHaveLength(1);
    expect(out[0].pending).toBeUndefined();
    expect(out[0].strength).toBe(2);
  });

  it("never emits a hex twice", () => {
    const out = withOwnFloor({
      ...base,
      rows: [row("8c2a")],
      owned: new Set(["8c2a", "8c2b"]),
      pending: new Set(["8c2a", "8c2b", "8c2c"]),
    });
    expect(out).toHaveLength(3);
    expect(new Set(out.map((r) => r.h3)).size).toBe(3);
  });

  it("leaves other players' blocks exactly as the server sent them", () => {
    const theirs = row("8cff", THEM, 7);
    const out = withOwnFloor({
      ...base,
      rows: [theirs],
      owned: new Set(["8c2a"]),
    });
    expect(out).toContainEqual(theirs);
  });

  it("does nothing without an address", () => {
    // Signed out, there is no "own" to floor, and inventing an owner would
    // paint someone else's map as the viewer's.
    const rows = [row("8cff", THEM)];
    expect(
      withOwnFloor({ ...base, rows, address: null, owned: new Set(["8c2a"]) }),
    ).toBe(rows);
  });

  it("returns the same array when there is nothing to add", () => {
    const rows = [row("8cff")];
    expect(withOwnFloor({ ...base, rows })).toBe(rows);
  });
});

describe("forgetSettled", () => {
  it("drops hexes the server has answered for", () => {
    const pending = new Set(["a", "b", "c"]);
    forgetSettled(pending, ["a", "c"]);
    expect([...pending]).toEqual(["b"]);
  });

  it("ignores hexes it never held", () => {
    const pending = new Set(["a"]);
    forgetSettled(pending, ["z"]);
    expect([...pending]).toEqual(["a"]);
  });
});
