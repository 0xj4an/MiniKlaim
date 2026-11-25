import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { cellToParent, latLngToCell } from "h3-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hexes, users } from "@/lib/db/schema";
import type { WorldOwnerGroup } from "@/lib/map/worldHexes";

// TEST_DATABASE_URL=postgresql://... npx vitest run lib/map/worldList.db.test.ts
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
const client = url ? postgres(url, { prepare: false, max: 2 }) : null;
const db = client ? drizzle(client) : null;

const NAMED = "0x00000000000000000000000000000000000d0a01";
const BARE = "0x00000000000000000000000000000000000d0a02";
// More than one cursor slice, so the test reads across the seam.
const MANY = 5_300;
const cell = (i: number) => latLngToCell(-33.9 + i * 0.0003, 18.4, 12);
const namedCells = Array.from({ length: MANY }, (_, i) => cell(i));
const bareCell = latLngToCell(64.1466, -21.9426, 12);

describe.skipIf(!db)("world list read in slices", () => {
  beforeAll(async () => {
    await db!.delete(hexes).where(inArray(hexes.ownerAddress, [NAMED, BARE]));
    await db!.delete(users).where(inArray(users.address, [NAMED, BARE]));
    await db!.insert(users).values([
      { address: NAMED, username: "slices_named" },
      { address: BARE },
    ]);
    for (let i = 0; i < namedCells.length; i += 1000) {
      await db!.insert(hexes).values(
        namedCells.slice(i, i + 1000).map((h3Id) => ({ h3Id, ownerAddress: NAMED })),
      );
    }
    await db!.insert(hexes).values({ h3Id: bareCell, ownerAddress: BARE });
  }, 60_000);

  afterAll(async () => {
    await db!.delete(hexes).where(inArray(hexes.ownerAddress, [NAMED, BARE]));
    await db!.delete(users).where(inArray(users.address, [NAMED, BARE]));
  });

  it("groups every block under its owner, with the name the app expects", async () => {
    const { worldList } = await import("@/lib/map/worldList");
    const packed = await worldList("owners");
    const body = JSON.parse(Buffer.from(packed.json).toString()) as {
      owners: WorldOwnerGroup[];
    };
    const named = body.owners.find((g) => g.owner === NAMED);
    expect(named?.ownerUsername).toBe("slices_named");
    expect(new Set(named?.h3)).toEqual(new Set(namedCells));
    expect(named?.h3).toHaveLength(MANY);
    const bare = body.owners.find((g) => g.owner === BARE);
    expect(bare).toEqual({ owner: BARE, ownerUsername: null, h3: [bareCell] });
    // One group per owner even when the owner's rows span two slices.
    expect(body.owners.filter((g) => g.owner === NAMED)).toHaveLength(1);
  });

  it("serves the one-row-per-block shape as valid JSON across slices", async () => {
    const { worldList } = await import("@/lib/map/worldList");
    const packed = await worldList("flat");
    const body = JSON.parse(Buffer.from(packed.json).toString()) as {
      hexes: { h3: string; owner: string; ownerUsername: string | null }[];
    };
    const mine = body.hexes.filter((r) => r.owner === NAMED);
    expect(mine).toHaveLength(MANY);
    expect(mine[0]).toEqual({ h3: mine[0].h3, owner: NAMED, ownerUsername: "slices_named" });
    expect(body.hexes.find((r) => r.h3 === bareCell)).toEqual({
      h3: bareCell,
      owner: BARE,
      ownerUsername: null,
    });
  });

  it("thins to parent cells and still reports the real total", async () => {
    const { thinnedWorldList } = await import("@/lib/map/worldList");
    const packed = await thinnedWorldList(2);
    const body = JSON.parse(Buffer.from(packed.json).toString()) as {
      owners: WorldOwnerGroup[];
      total: number;
    };
    const [{ n }] = await client!`select count(*)::int as n from hexes`;
    expect(body.total).toBe(n);
    const all = body.owners.flatMap((g) => g.h3);
    // Each entry is a real block standing for its parent cell.
    const parents = all.map((h3) => cellToParent(h3, 2));
    expect(parents).toContain(cellToParent(bareCell, 2));
    expect(parents).toContain(cellToParent(namedCells[0], 2));
    // Thinned: one entry per parent cell, never one per block.
    expect(new Set(parents).size).toBe(parents.length);
    expect(all.length).toBeLessThan(n);
  });
});

/**
 * The list is kept in memory and brought up to date from what changed
 * (lib/map/worldState.ts). These hold that path to the same answers as
 * reading the table, against a real Postgres: the clock, the snapshot and
 * the `claimed_at` filter are the database's.
 */
describe.skipIf(!db)("world list kept up to date from changes", () => {
  const THIEF = "0x00000000000000000000000000000000000d0a03";
  const mine = Array.from({ length: 40 }, (_, i) =>
    latLngToCell(48.85 + i * 0.0004, 2.35, 12),
  );
  const late = latLngToCell(35.6762, 139.6503, 12);

  async function owners() {
    const { worldList } = await import("@/lib/map/worldList");
    const packed = await worldList("owners");
    const body = JSON.parse(Buffer.from(packed.json).toString()) as {
      owners: WorldOwnerGroup[];
    };
    return { packed, of: (a: string) => body.owners.find((g) => g.owner === a) };
  }

  beforeAll(async () => {
    await db!.delete(hexes).where(inArray(hexes.ownerAddress, [NAMED, THIEF]));
    await db!.delete(users).where(inArray(users.address, [NAMED, THIEF]));
    await db!.insert(users).values([
      { address: NAMED, username: "changes_named" },
      { address: THIEF, username: "changes_thief" },
    ]);
    await db!.insert(hexes).values(
      mine.map((h3Id) => ({ h3Id, ownerAddress: NAMED })),
    );
    const { worldStateForTests } = await import("@/lib/map/worldList");
    worldStateForTests.forget();
  }, 60_000);

  afterAll(async () => {
    await db!.delete(hexes).where(inArray(hexes.ownerAddress, [NAMED, THIEF]));
    await db!.delete(users).where(inArray(users.address, [NAMED, THIEF]));
    // The last block of the file closes the connection both share.
    await client!.end();
  });

  it("reads the table once, then serves the same lists while nothing changes", async () => {
    const { worldStateForTests } = await import("@/lib/map/worldList");
    const first = await owners();
    expect(worldStateForTests.lastMode()).toBe("full");
    expect(first.of(NAMED)?.h3).toHaveLength(mine.length);
    worldStateForTests.expire();
    const second = await owners();
    expect(worldStateForTests.lastMode()).toBe("unchanged");
    expect(second.packed).toBe(first.packed);
  });

  it("picks up a capture and a steal without reading the table again", async () => {
    const { worldStateForTests, thinnedWorldList } = await import(
      "@/lib/map/worldList"
    );
    await db!.insert(hexes).values({ h3Id: late, ownerAddress: THIEF });
    await client!`
      update hexes set owner_address = ${THIEF}, claimed_at = now()
      where h3_id = ${mine[0]}`;
    worldStateForTests.expire();
    const after = await owners();
    expect(worldStateForTests.lastMode()).toBe("changes");
    expect(new Set(after.of(THIEF)?.h3)).toEqual(new Set([late, mine[0]]));
    expect(after.of(THIEF)?.ownerUsername).toBe("changes_thief");
    expect(after.of(NAMED)?.h3).toHaveLength(mine.length - 1);
    expect(after.of(NAMED)?.h3).not.toContain(mine[0]);
    const thin = JSON.parse(
      Buffer.from((await thinnedWorldList(2)).json).toString(),
    ) as { owners: WorldOwnerGroup[]; total: number };
    const [{ n }] = await client!`select count(*)::int as n from hexes`;
    expect(thin.total).toBe(n);
    const parents = thin.owners.flatMap((g) => g.h3).map((h) => cellToParent(h, 2));
    expect(parents).toContain(cellToParent(late, 2));
  });

  it("reads the table again when memory and table disagree", async () => {
    const { worldStateForTests } = await import("@/lib/map/worldList");
    // Nothing in the app deletes a block; this is the case the count guards.
    await client!`delete from hexes where h3_id = ${late}`;
    worldStateForTests.expire();
    const after = await owners();
    expect(worldStateForTests.lastMode()).toBe("full");
    expect(after.of(THIEF)?.h3).toEqual([mine[0]]);
  });

  it("reads the table again once the last whole read is old", async () => {
    const { worldStateForTests, FULL_READ_EVERY_MS } = await import(
      "@/lib/map/worldList"
    );
    worldStateForTests.expire();
    await owners();
    expect(worldStateForTests.lastMode()).not.toBe("full");
    // A change made behind `claimed_at`'s back: only a whole read sees it.
    await client!`update hexes set owner_address = ${THIEF} where h3_id = ${mine[1]}`;
    worldStateForTests.ageFullRead(FULL_READ_EVERY_MS + 1);
    worldStateForTests.expire();
    const after = await owners();
    expect(worldStateForTests.lastMode()).toBe("full");
    expect(after.of(THIEF)?.h3).toContain(mine[1]);
  });
});
