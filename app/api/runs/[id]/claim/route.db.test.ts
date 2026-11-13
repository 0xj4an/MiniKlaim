import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { latLngToCell } from "h3-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hexActions, hexes, runs, users } from "@/lib/db/schema";
import { hashRunToken, RUN_TOKEN_HEADER } from "@/lib/onchain/sponsorRules";

// The whole claim route against a disposable database with the migrations
// applied:
// TEST_DATABASE_URL=postgresql://... npx vitest run "app/api/runs/[id]/claim/route.db.test.ts"
// CI has no database, so it is skipped there.
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { prepare: false, max: 2 }) : null;
const db = client ? drizzle(client) : null;

const A = "0x00000000000000000000000000000000000c1a1a";
const RUN = "c1a1c1a1-0000-0000-0000-000000000001";
const TOKEN = "test-run-token";
// A straight road in Mumbai, one block per ~17 m.
const road = Array.from({ length: 400 }, (_, i) =>
  latLngToCell(19.06, 72.83 + i * 0.00017, 12),
).filter((h, i, a) => a.indexOf(h) === i);

type Row = { h3: string; rejected?: { reason: string }; action?: string };
let POST: (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

const claim = async (items: Array<{ h3: string; ageMs?: number }>) => {
  const res = await POST(
    new Request(`http://test/api/runs/${RUN}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [RUN_TOKEN_HEADER]: TOKEN },
      body: JSON.stringify({ hexes: items }),
    }),
    { params: Promise.resolve({ id: RUN }) },
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: Row[] }).results;
};

describe.skipIf(!db)("POST /api/runs/:id/claim (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.NEXT_PUBLIC_HEX_STRENGTH = "on";
    ({ POST } = await import("./route"));
  });

  beforeEach(async () => {
    await db!.delete(hexActions).where(eq(hexActions.playerKey, A));
    await db!.delete(hexes).where(inArray(hexes.h3Id, road));
    await db!.delete(runs).where(eq(runs.id, RUN));
    await db!.insert(users).values({ address: A }).onConflictDoNothing();
  });

  afterAll(async () => {
    await db!.delete(hexActions).where(eq(hexActions.playerKey, A));
    await db!.delete(hexes).where(inArray(hexes.h3Id, road));
    await db!.delete(runs).where(eq(runs.id, RUN));
    await client!.end();
  });

  it("keeps every block of a drive uploaded late, 100 at a time", async () => {
    // Eight minutes on the road with no signal, then three uploads in a row.
    const secPerBlock = 1.6;
    const blocks = road.slice(0, 300);
    const started = new Date(Date.now() - blocks.length * secPerBlock * 1000 - 5_000);
    await db!.insert(runs).values({ id: RUN, userAddress: A, claimTokenHash: hashRunToken(TOKEN), startedAt: started, declaredMode: "car" });
    let rejected = 0;
    for (let b = 0; b < 3; b++) {
      const now = Date.now();
      const results = await claim(
        blocks.slice(b * 100, b * 100 + 100).map((h3, i) => ({
          h3,
          ageMs: now - (started.getTime() + (b * 100 + i + 1) * secPerBlock * 1000),
        })),
      );
      rejected += results.filter((r) => r.rejected).length;
    }
    expect(rejected).toBe(0);
    const owned = await db!.select({ h3: hexes.h3Id }).from(hexes).where(inArray(hexes.h3Id, blocks));
    expect(owned.length).toBe(300);
  });

  it("the same uploads without ages still lose blocks, as old clients do", async () => {
    const blocks = road.slice(0, 300);
    await db!.insert(runs).values({
      id: RUN,
      claimTokenHash: hashRunToken(TOKEN),
      userAddress: A,
      startedAt: new Date(Date.now() - 485_000),
      declaredMode: "car",
    });
    let rejected = 0;
    for (let b = 0; b < 3; b++) {
      const results = await claim(blocks.slice(b * 100, b * 100 + 100).map((h3) => ({ h3 })));
      rejected += results.filter((r) => r.rejected).length;
    }
    expect(rejected).toBeGreaterThan(0);
  });

  it("a batch sent twice does not pull the run back or fail what follows", async () => {
    await db!.insert(runs).values({
      id: RUN,
      claimTokenHash: hashRunToken(TOKEN),
      userAddress: A,
      startedAt: new Date(Date.now() - 120_000),
      declaredMode: "car",
    });
    const first = road.slice(0, 60).map((h3) => ({ h3, ageMs: 1_000 }));
    expect((await claim(first)).filter((r) => r.rejected).length).toBe(0);
    // The answer was lost: the phone sends the same blocks again.
    const again = await claim(first);
    expect(again.filter((r) => r.rejected).length).toBe(0);
    expect(again.every((r) => r.action === "repeat")).toBe(true);
    const [run] = await db!.select({ lastH3: runs.lastH3 }).from(runs).where(eq(runs.id, RUN));
    expect(run.lastH3).toBe(road[59]);
    // And the next blocks down the road still count.
    const next = await claim(road.slice(60, 63).map((h3) => ({ h3, ageMs: 0 })));
    expect(next.filter((r) => r.rejected).length).toBe(0);
  });
  it("refuses blocks from a caller without the run's token", async () => {
    await db!.insert(runs).values({
      id: RUN,
      claimTokenHash: hashRunToken(TOKEN),
      userAddress: A,
      startedAt: new Date(Date.now() - 60_000),
    });
    for (const headers of [{}, { [RUN_TOKEN_HEADER]: "someone-else" }]) {
      const res = await POST(
        new Request(`http://test/api/runs/${RUN}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ hexes: [{ h3: road[0] }] }),
        }),
        { params: Promise.resolve({ id: RUN }) },
      );
      expect(res.status).toBe(403);
    }
    const owned = await db!.select().from(hexes).where(inArray(hexes.h3Id, road));
    expect(owned.length).toBe(0);
  });
});
