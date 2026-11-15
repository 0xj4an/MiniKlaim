import { describe, expect, test } from "vitest";
import { cellToLatLng, latLngToCell } from "h3-js";
import {
  diskCoversView,
  diskKForRadius,
  diskRadiusMeters,
  hexesInBounds,
  mergeHexes,
  OWN_LIST_MAX_AGE_MS,
  patchRows,
  placeHexes,
  rememberOwners,
  shouldFetchOwnList,
  viewportNeedsWorld,
  type ClaimedHexRow,
} from "./claimedView";

const MDE_LAT = 6.2529;
const MDE_LNG = -75.5646;

describe("claimed view", () => {
  test("a follow-zoom screen stays on the near disk", () => {
    expect(viewportNeedsWorld(400)).toBe(false);
    expect(diskKForRadius(400)).toBeLessThanOrEqual(60);
    expect(diskRadiusMeters(diskKForRadius(400))).toBeGreaterThanOrEqual(400);
  });

  test("a city zoom is wider than the disk cap", () => {
    expect(viewportNeedsWorld(7000)).toBe(true);
    expect(diskKForRadius(7000)).toBe(60);
  });

  test("keeps hexes inside the screen and drops the rest", () => {
    const here = latLngToCell(MDE_LAT, MDE_LNG, 12);
    const away = latLngToCell(MDE_LAT + 0.2, MDE_LNG, 12);
    const [lat, lng] = cellToLatLng(here);
    const rows = placeHexes([
      { h3: here, owner: "0xabc", ownerUsername: null },
      { h3: away, owner: "0xdef", ownerUsername: null },
    ]);
    const visible = hexesInBounds(rows, {
      west: lng - 0.01,
      east: lng + 0.01,
      south: lat - 0.01,
      north: lat + 0.01,
    });
    expect(visible.map((row) => row.h3)).toEqual([here]);
  });

  test("a fresh claim replaces the cached owner", () => {
    const h3 = latLngToCell(MDE_LAT, MDE_LNG, 12);
    const [lat, lng] = cellToLatLng(h3);
    const oldRow = { h3, owner: "0xold", ownerUsername: null, lat, lng };
    const next = { h3, owner: "0xnew", ownerUsername: "ada", lat, lng };
    expect(mergeHexes([oldRow], [next])).toEqual([next]);
  });

  test("a loaded disk covers a small pan and not a zoom out", () => {
    expect(diskCoversView(MDE_LAT, MDE_LNG, 900, MDE_LAT, MDE_LNG, 400)).toBe(
      true,
    );
    expect(diskCoversView(MDE_LAT, MDE_LNG, 900, MDE_LAT, MDE_LNG, 2000)).toBe(
      false,
    );
  });

  test("a painted hex of someone else is no longer treated as ours", () => {
    const owned = new Set(["mine", "stolen"]);
    const me = new Set(["0xme"]);
    rememberOwners(
      owned,
      [
        { h3: "mine", owner: "0xME", ownerUsername: null },
        { h3: "stolen", owner: "0xother", ownerUsername: null },
        { h3: "theirs", owner: "0xother", ownerUsername: null },
      ],
      me,
    );
    expect(Array.from(owned).sort()).toEqual(["mine"]);
  });
});

describe("shouldFetchOwnList", () => {
  const MIN = 60_000;

  test("a new screen always downloads it", () => {
    expect(
      shouldFetchOwnList({ reason: "fresh", haveWorld: true, ownAgeMs: 0 }),
    ).toBe(true);
  });

  // 14 Nov 2026: one phone asked 1,312 times in two drives, about 100 MB.
  test("a batch the server accepted does not, while the list is recent", () => {
    expect(
      shouldFetchOwnList({ reason: "claimed", haveWorld: true, ownAgeMs: 4_000 }),
    ).toBe(false);
    expect(
      shouldFetchOwnList({
        reason: "claimed",
        haveWorld: true,
        ownAgeMs: OWN_LIST_MAX_AGE_MS - 1,
      }),
    ).toBe(false);
  });

  test("a batch does once the list is ten minutes old", () => {
    expect(
      shouldFetchOwnList({
        reason: "claimed",
        haveWorld: true,
        ownAgeMs: OWN_LIST_MAX_AGE_MS,
      }),
    ).toBe(true);
  });

  test("a pan never does when there is a world list to draw from", () => {
    expect(
      shouldFetchOwnList({ reason: "move", haveWorld: true, ownAgeMs: Infinity }),
    ).toBe(false);
  });

  // The old rule asked on every pan when nothing was saved on the phone.
  test("a pan with no world list asks once, not on every pan", () => {
    expect(
      shouldFetchOwnList({ reason: "move", haveWorld: false, ownAgeMs: Infinity }),
    ).toBe(true);
    expect(
      shouldFetchOwnList({ reason: "move", haveWorld: false, ownAgeMs: 2 * MIN }),
    ).toBe(false);
  });

  test("a list that never arrived counts as old, NaN included", () => {
    expect(
      shouldFetchOwnList({ reason: "claimed", haveWorld: true, ownAgeMs: Infinity }),
    ).toBe(true);
    expect(
      shouldFetchOwnList({ reason: "claimed", haveWorld: true, ownAgeMs: Number.NaN }),
    ).toBe(true);
  });
});

describe("patchRows", () => {
  const A = latLngToCell(MDE_LAT, MDE_LNG, 12);
  const B = latLngToCell(MDE_LAT + 0.001, MDE_LNG, 12);
  const C = latLngToCell(MDE_LAT + 0.002, MDE_LNG, 12);
  const me = "0x00000000000000000000000000000000000000aa";
  const other = "0x00000000000000000000000000000000000000bb";
  const same = (row: ClaimedHexRow) => row;

  // Without this the saved row still names the old owner, rememberOwners
  // reads it as "changed hands" and the stolen block is drawn as theirs.
  test("a stolen block changes owner and level in the saved rows", () => {
    const rows: ClaimedHexRow[] = [
      { h3: A, owner: other, ownerUsername: "them", strength: 3 },
    ];
    const out = patchRows(
      rows,
      new Map([[A, { owner: me, ownerUsername: "me", strength: 1 }]]),
      same,
    );
    expect(out).toEqual([{ h3: A, owner: me, ownerUsername: "me", strength: 1 }]);
    const owned = new Set<string>([A]);
    rememberOwners(owned, out, new Set([me]));
    expect(owned.has(A)).toBe(true);
  });

  test("an attack only lowers the level and keeps the owner", () => {
    const rows: ClaimedHexRow[] = [
      { h3: A, owner: other, ownerUsername: "them", strength: 7 },
    ];
    const out = patchRows(rows, new Map([[A, { strength: 6 }]]), same);
    expect(out).toEqual([{ h3: A, owner: other, ownerUsername: "them", strength: 6 }]);
  });

  test("a new block the rows did not have is added, placed", () => {
    const rows = placeHexes([{ h3: A, owner: other, ownerUsername: null }]);
    const out = patchRows(
      rows,
      new Map([[B, { owner: me, ownerUsername: null, strength: 1 }]]),
      (row) => placeHexes([row])[0],
    );
    expect(out).toHaveLength(2);
    expect(out[1].h3).toBe(B);
    expect(out[1].owner).toBe(me);
    expect(typeof out[1].lat).toBe("number");
  });

  test("an attack on a block the rows do not have is dropped", () => {
    const out = patchRows([], new Map([[C, { strength: 2 }]]), same);
    expect(out).toEqual([]);
  });

  test("a reinforce raises the level of the player's own block", () => {
    const rows: ClaimedHexRow[] = [
      { h3: A, owner: me, ownerUsername: "me", strength: 2 },
    ];
    const out = patchRows(
      rows,
      new Map([[A, { owner: me, ownerUsername: "me", strength: 3 }]]),
      same,
    );
    expect(out[0].strength).toBe(3);
  });

  test("an answer with no level keeps the one the row had", () => {
    const rows: ClaimedHexRow[] = [
      { h3: A, owner: other, ownerUsername: null, strength: 4 },
    ];
    const out = patchRows(rows, new Map([[A, { owner: me }]]), same);
    expect(out[0]).toEqual({ h3: A, owner: me, ownerUsername: null, strength: 4 });
  });

  test("nothing changed returns the same array, untouched", () => {
    const rows: ClaimedHexRow[] = [{ h3: A, owner: other, ownerUsername: null }];
    expect(patchRows(rows, new Map(), same)).toBe(rows);
  });
});
