import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { cellToParent, latLngToCell } from "h3-js";
import { gunzipSync } from "node:zlib";
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
    await client!.end();
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
    expect(gunzipSync(packed.gzip).equals(Buffer.from(packed.json))).toBe(true);
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
