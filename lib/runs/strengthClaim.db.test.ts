import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hexActions, hexes, runs, users } from "@/lib/db/schema";
import { strengthSql } from "@/lib/runs/hexStrength";
import { applyStrengthBatch } from "@/lib/runs/strengthClaim";

// Runs only against a disposable database with the migrations applied:
// TEST_DATABASE_URL=postgresql://... npx vitest run lib/runs/strengthClaim.db.test.ts
// CI has no database, so it is skipped there.
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { prepare: false, max: 4 }) : null;
const db = client ? drizzle(client) : null;

const A = "0x000000000000000000000000000000000000000a";
const A2 = "0x00000000000000000000000000000000000000a2";
const B = "0x000000000000000000000000000000000000000b";
const C = "0x000000000000000000000000000000000000000c";
const RUN_A = "aaaaaaaa-0000-0000-0000-000000000001";
const RUN_B = "bbbbbbbb-0000-0000-0000-000000000001";
const RUN_C = "cccccccc-0000-0000-0000-000000000001";
const H1 = "8c66a5a0d4d19ff";
const H2 = "8c66a5a0d4d1bff";
const DAY = 86_400_000;
const T0 = new Date("2026-11-01T15:00:00Z");
const geo = () => ({ country: "COL", city: "Medellin" });

const pass = (
  actor: string,
  runId: string,
  h3Ids: string[],
  now: Date,
  linked: string[] = [actor],
) =>
  applyStrengthBatch(db!, {
    runId,
    actor,
    playerAddresses: new Set(linked),
    timeZone: "America/Bogota",
    h3Ids,
    geo,
    now,
  });

const hex = async (h3: string) =>
  (await db!.select().from(hexes).where(eq(hexes.h3Id, h3)))[0];

describe.skipIf(!db)("applyStrengthBatch (database)", () => {
  beforeEach(async () => {
    await db!.delete(hexActions);
    await db!.delete(hexes).where(inArray(hexes.h3Id, [H1, H2]));
    await db!.delete(runs).where(inArray(runs.id, [RUN_A, RUN_B, RUN_C]));
    for (const address of [A, A2, B, C]) {
      await db!.insert(users).values({ address }).onConflictDoNothing();
    }
    await db!.insert(runs).values([
      { id: RUN_A, userAddress: A },
      { id: RUN_B, userAddress: B },
      { id: RUN_C, userAddress: C },
    ]);
  });

  afterAll(async () => {
    await client?.end();
  });

  it("captures a free block at level 1", async () => {
    const r = await pass(A, RUN_A, [H1], T0);
    expect(r.byH3.get(H1)).toEqual({ action: "new", strength: 1, ownedByActor: true });
    expect(r.captured).toBe(1);
    expect(r.conquests).toBe(0);
    const row = await hex(H1);
    expect(row.ownerAddress).toBe(A);
    expect(row.baseStrength).toBe(1);
    expect(row.runId).toBe(RUN_A);
  });

  it("owner: repeat the same day, reinforce the next day", async () => {
    await pass(A, RUN_A, [H1], T0);
    const same = await pass(A, RUN_A, [H1], new Date(T0.getTime() + 3_600_000));
    expect(same.byH3.get(H1)?.action).toBe("repeat");
    const next = await pass(A, RUN_A, [H1], new Date(T0.getTime() + DAY));
    expect(next.byH3.get(H1)).toEqual({ action: "reinforce", strength: 2, ownedByActor: true });
    expect((await hex(H1)).baseStrength).toBe(2);
  });

  it("ten days of visits reach 10 and stay there", async () => {
    await pass(A, RUN_A, [H1], T0);
    for (let d = 1; d <= 11; d += 1) {
      await pass(A, RUN_A, [H1], new Date(T0.getTime() + d * DAY));
    }
    const row = await hex(H1);
    expect(row.baseStrength).toBe(10);
    expect(row.reinforcedAt.getTime()).toBe(T0.getTime() + 11 * DAY);
  });

  it("attack keeps owner, run and settlement; level 1 attack captures", async () => {
    await pass(A, RUN_A, [H1], T0);
    await pass(A, RUN_A, [H1], new Date(T0.getTime() + DAY));
    await db!
      .update(hexes)
      .set({ mintedAt: T0, mintTxHash: "0xabc" })
      .where(eq(hexes.h3Id, H1));

    const hit = await pass(B, RUN_B, [H1], new Date(T0.getTime() + 2 * DAY));
    expect(hit.byH3.get(H1)).toEqual({ action: "attack", strength: 1, ownedByActor: false });
    expect(hit.damaged).toBe(1);
    let row = await hex(H1);
    expect(row.ownerAddress).toBe(A);
    expect(row.runId).toBe(RUN_A);
    expect(row.mintTxHash).toBe("0xabc");
    expect(row.damage).toBe(1);

    const take = await pass(B, RUN_B, [H1], new Date(T0.getTime() + 3 * DAY));
    expect(take.byH3.get(H1)).toEqual({ action: "capture", strength: 1, ownedByActor: true });
    expect(take.conquests).toBe(1);
    row = await hex(H1);
    expect(row.ownerAddress).toBe(B);
    expect(row.runId).toBe(RUN_B);
    expect(row.mintTxHash).toBeNull();
    expect(row.baseStrength).toBe(1);
    expect(row.damage).toBe(0);
  });

  it("attacker gets one hit per day on a block", async () => {
    await pass(A, RUN_A, [H1], T0);
    await pass(A, RUN_A, [H1], new Date(T0.getTime() + DAY));
    await pass(A, RUN_A, [H1], new Date(T0.getTime() + 2 * DAY));
    const t = new Date(T0.getTime() + 3 * DAY);
    expect((await pass(B, RUN_B, [H1], t)).byH3.get(H1)?.action).toBe("attack");
    expect((await pass(B, RUN_B, [H1], t)).byH3.get(H1)?.action).toBe("repeat");
    expect((await hex(H1)).damage).toBe(1);
  });

  it("two attackers the same day: first lowers, second captures", async () => {
    await pass(A, RUN_A, [H1], T0);
    await pass(A, RUN_A, [H1], new Date(T0.getTime() + DAY));
    const t = new Date(T0.getTime() + 2 * DAY);
    expect((await pass(B, RUN_B, [H1], t)).byH3.get(H1)?.action).toBe("attack");
    expect((await pass(C, RUN_C, [H1], t)).byH3.get(H1)?.action).toBe("capture");
    expect((await hex(H1)).ownerAddress).toBe(C);
  });

  it("linked wallets share the daily limit", async () => {
    await pass(A, RUN_A, [H1], T0, [A, A2]);
    const r = await pass(A2, RUN_A, [H1], new Date(T0.getTime() + 60_000), [A, A2]);
    expect(r.byH3.get(H1)?.action).toBe("repeat");
    expect(r.byH3.get(H1)?.ownedByActor).toBe(true);
  });

  it("owner visit folds damage into the new level", async () => {
    await pass(A, RUN_A, [H1], T0);
    for (let d = 1; d <= 4; d += 1) await pass(A, RUN_A, [H1], new Date(T0.getTime() + d * DAY));
    await pass(B, RUN_B, [H1], new Date(T0.getTime() + 5 * DAY));
    await pass(B, RUN_B, [H1], new Date(T0.getTime() + 6 * DAY));
    // level 5, two hits -> 3; owner visit -> 4, damage cleared.
    const r = await pass(A, RUN_A, [H1], new Date(T0.getTime() + 7 * DAY));
    expect(r.byH3.get(H1)?.strength).toBe(4);
    const row = await hex(H1);
    expect(row.baseStrength).toBe(4);
    expect(row.damage).toBe(0);
  });

  it("parallel passes on a level-1 block capture once", async () => {
    await pass(A, RUN_A, [H1], T0);
    const t = new Date(T0.getTime() + DAY);
    const [rb, rc] = await Promise.all([pass(B, RUN_B, [H1], t), pass(C, RUN_C, [H1], t)]);
    const actions = [rb.byH3.get(H1)?.action, rc.byH3.get(H1)?.action].sort();
    // One captures from A at level 1; the other then attacks the new
    // owner's level-1 block, which is a capture too. Owner ends as one of
    // them and the row is consistent.
    expect(actions).toEqual(["capture", "capture"]);
    const row = await hex(H1);
    expect([B, C]).toContain(row.ownerAddress);
    expect(row.baseStrength).toBe(1);
    expect(row.damage).toBe(0);
  });

  it("SQL strength matches the TS function", async () => {
    await pass(A, RUN_A, [H1], T0);
    await db!
      .update(hexes)
      .set({ baseStrength: 7, damage: 2, reinforcedAt: new Date(Date.now() - 65 * DAY) })
      .where(eq(hexes.h3Id, H1));
    const [row] = await db!
      .select({ s: strengthSql(hexes.baseStrength, hexes.damage, hexes.reinforcedAt) })
      .from(hexes)
      .where(eq(hexes.h3Id, H1));
    // 7 - 2 = 5, two full months -> 3.
    expect(row.s).toBe(3);
    const [deep] = await db!.execute<{ s: number }>(
      sql`select ${strengthSql(sql`3`, sql`2`, sql`now() - interval '400 days'`)} as s`,
    );
    expect(Number(deep.s)).toBe(1);
  });
});
