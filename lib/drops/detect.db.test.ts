import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { gridDisk, latLngToCell } from "h3-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dropFinds, drops, runs, users } from "@/lib/db/schema";
import { clearDropIndex, detectDrops } from "@/lib/drops/detect";

// Runs only against a disposable database with the migrations applied:
// TEST_DATABASE_URL=postgresql://... npx vitest run lib/drops/detect.db.test.ts
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { prepare: false, max: 4 }) : null;
const db = client ? drizzle(client) : null;

const A = "0x00000000000000000000000000000000000000d1";
const B = "0x00000000000000000000000000000000000000d2";
const RUN_A = "dddddddd-0000-0000-0000-000000000001";
const RUN_A2 = "dddddddd-0000-0000-0000-000000000002";
const RUN_B = "dddddddd-0000-0000-0000-000000000003";
const RUN_C = "dddddddd-0000-0000-0000-000000000004";
const C = "0x00000000000000000000000000000000000000d3";
const DROP = "dddddddd-0000-0000-0000-0000000000aa";
const DROP2 = "dddddddd-0000-0000-0000-0000000000bb";

// A Medellin test spot, never a pilot one: this repo is public.
const BLOCK = latLngToCell(6.2087, -75.5677, 12);
const NEIGHBOUR = gridDisk(BLOCK, 1).find((c) => c !== BLOCK)!;
const FAR = latLngToCell(6.2518, -75.5636, 12);
const T0 = new Date("2026-11-05T10:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

const pass = (runId: string, player: string, cells: Array<[string, number | null]>, now: Date, mode: "foot" | "car" | null = "foot") =>
  detectDrops(db!, {
    runId,
    player,
    declaredMode: mode,
    accepted: cells.map(([h3, accuracy]) => ({ h3, accuracy })),
    now,
  });

const findsFor = (runId: string) => db!.select().from(dropFinds).where(eq(dropFinds.runId, runId));

describe.skipIf(!db)("detectDrops (database)", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_TREASURES = "on";
  });

  beforeEach(async () => {
    clearDropIndex();
    await db!.delete(dropFinds).where(inArray(dropFinds.dropId, [DROP, DROP2]));
    await db!.delete(drops).where(inArray(drops.id, [DROP, DROP2]));
    await db!.delete(runs).where(inArray(runs.id, [RUN_A, RUN_A2, RUN_B, RUN_C]));
    for (const address of [A, B, C]) await db!.insert(users).values({ address }).onConflictDoNothing();
    await db!.insert(runs).values([
      { id: RUN_A, userAddress: A },
      { id: RUN_A2, userAddress: A },
      { id: RUN_B, userAddress: B },
      { id: RUN_C, userAddress: C },
    ]);
    await db!.insert(drops).values({
      id: DROP,
      h3: BLOCK,
      hintH3: "88661836d1fffff",
      label: "Test plaza",
      token: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
      amount: "1000000",
      startsAt: new Date(T0.getTime() - 3_600_000),
      endsAt: new Date(T0.getTime() + 86_400_000),
      salt: `0x${"22".repeat(32)}`,
      commitment: `0x${"33".repeat(32)}`,
      status: "active",
    });
  });

  afterAll(async () => {
    await client?.end();
  });

  it("finds after a walk through the block and its ring", async () => {
    expect(await pass(RUN_A, A, [[NEIGHBOUR, 9]], at(0))).toEqual([]);
    expect(await pass(RUN_A, A, [[BLOCK, 7]], at(6))).toEqual([]);
    const won = await pass(RUN_A, A, [[NEIGHBOUR, 9]], at(14));
    expect(won).toEqual([
      { dropId: DROP, label: "Test plaza", token: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", amount: "1000000" },
    ]);
    const [f] = await findsFor(RUN_A);
    expect(f.review).toBe("ok");
    expect(f.accuracyM).toBe(7);
    expect(f.nearBatches).toBe(3);
    const [d] = await db!.select().from(drops).where(eq(drops.id, DROP));
    expect(d.status).toBe("found");
  });

  it("ignores blocks far from any drop", async () => {
    expect(await pass(RUN_A, A, [[FAR, 5]], at(0))).toEqual([]);
    expect(await findsFor(RUN_A)).toHaveLength(0);
  });

  it("keeps a too-quick pass pending", async () => {
    await pass(RUN_A, A, [[BLOCK, 7], [NEIGHBOUR, 7]], at(0));
    const [f] = await findsFor(RUN_A);
    expect(f.review).toBe("pending");
  });

  it("rejects a car and poor accuracy", async () => {
    await pass(RUN_A, A, [[BLOCK, 5]], at(0), "car");
    expect((await findsFor(RUN_A))[0].review).toBe("rejected");

    await pass(RUN_B, B, [[BLOCK, 40]], at(0));
    await pass(RUN_B, B, [[NEIGHBOUR, 5]], at(15));
    const [f] = await findsFor(RUN_B);
    expect(f.review).toBe("rejected");
    expect(f.reviewReason).toBe("accuracy:40");
  });

  it("has one winner: the second finder is late", async () => {
    await pass(RUN_A, A, [[BLOCK, 5]], at(0));
    await pass(RUN_B, B, [[BLOCK, 5]], at(1));
    expect(await pass(RUN_A, A, [[NEIGHBOUR, 5]], at(12))).toHaveLength(1);
    clearDropIndex();
    // B's row was pending when the index still listed the drop.
    expect(await pass(RUN_B, B, [[NEIGHBOUR, 5]], at(13))).toEqual([]);
    const finds = await db!.select().from(dropFinds).where(eq(dropFinds.dropId, DROP));
    expect(finds.filter((f) => f.review === "ok")).toHaveLength(1);
  });

  it("does not re-judge a decided find", async () => {
    await pass(RUN_A, A, [[BLOCK, 5]], at(0), "car");
    await pass(RUN_A, A, [[NEIGHBOUR, 5]], at(20), "foot");
    expect((await findsFor(RUN_A))[0].review).toBe("rejected");
  });

  it("a refilled spot opens again: one new winner, the old drop stays closed", async () => {
    await pass(RUN_A, A, [[BLOCK, 5]], at(0));
    expect(await pass(RUN_A, A, [[NEIGHBOUR, 5]], at(12))).toHaveLength(1);
    await db!.update(drops).set({ status: "claimed" }).where(eq(drops.id, DROP));

    // Same block, new prize.
    const [old] = await db!.select().from(drops).where(eq(drops.id, DROP));
    await db!.insert(drops).values({ ...old, id: DROP2, status: "active", createdAt: new Date() });
    clearDropIndex();

    await pass(RUN_A2, A, [[BLOCK, 5]], at(100));
    const won = await pass(RUN_A2, A, [[NEIGHBOUR, 5]], at(112));
    expect(won.map((w) => w.dropId)).toEqual([DROP2]);
    const [d1] = await db!.select().from(drops).where(eq(drops.id, DROP));
    expect(d1.status).toBe("claimed");
  });

  it("several winners: one prize per player, closed when the slots are taken", async () => {
    await db!.update(drops).set({ maxWinners: 2 }).where(eq(drops.id, DROP));
    clearDropIndex();
    const walk = async (run: string, who: string, t: number) => {
      await pass(run, who, [[BLOCK, 5]], at(t));
      return pass(run, who, [[NEIGHBOUR, 5]], at(t + 12));
    };
    expect(await walk(RUN_A, A, 0)).toHaveLength(1);
    // A again on another run: already won this drop, ignored.
    expect(await walk(RUN_A2, A, 100)).toEqual([]);
    let [d] = await db!.select().from(drops).where(eq(drops.id, DROP));
    expect(d.status).toBe("active");
    expect(await walk(RUN_B, B, 200)).toHaveLength(1);
    [d] = await db!.select().from(drops).where(eq(drops.id, DROP));
    expect(d.status).toBe("found");
    clearDropIndex();
    expect(await walk(RUN_C, C, 300)).toEqual([]);
    const ok = (await db!.select().from(dropFinds).where(eq(dropFinds.dropId, DROP))).filter((f) => f.review === "ok");
    expect(ok.map((f) => f.player).sort()).toEqual([A, B]);
  });

  it("does nothing when the feature is off", async () => {
    process.env.NEXT_PUBLIC_TREASURES = "off";
    try {
      expect(await pass(RUN_A, A, [[BLOCK, 5]], at(0))).toEqual([]);
      expect(await findsFor(RUN_A)).toHaveLength(0);
    } finally {
      process.env.NEXT_PUBLIC_TREASURES = "on";
    }
  });
});
