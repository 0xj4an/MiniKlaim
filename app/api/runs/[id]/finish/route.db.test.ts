import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runs, users } from "@/lib/db/schema";
import { hashRunToken, RUN_TOKEN_HEADER } from "@/lib/onchain/sponsorRules";

// TEST_DATABASE_URL=postgresql://... npx vitest run "app/api/runs/[id]/finish/route.db.test.ts"
// CI has no database, so it is skipped there.
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { prepare: false, max: 2 }) : null;
const db = client ? drizzle(client) : null;

const A = "0x00000000000000000000000000000000000f1a1a";
const RUN = "f1a1f1a1-0000-0000-0000-000000000001";
const TOKEN = "test-run-token";

let PATCH: (
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

const finish = (headers: Record<string, string>, distanceMeters = 0) =>
  PATCH(
    new Request(`http://test/api/runs/${RUN}/finish`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ distanceMeters }),
    }),
    { params: Promise.resolve({ id: RUN }) },
  );

const row = async () =>
  (await db!.select().from(runs).where(eq(runs.id, RUN)))[0];

describe.skipIf(!db)("PATCH /api/runs/:id/finish (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ PATCH } = await import("./route"));
  });

  beforeEach(async () => {
    await db!.delete(runs).where(eq(runs.id, RUN));
    await db!.insert(users).values({ address: A }).onConflictDoNothing();
    await db!.insert(runs).values({
      id: RUN,
      userAddress: A,
      claimTokenHash: hashRunToken(TOKEN),
      startedAt: new Date(Date.now() - 600_000),
    });
  });

  afterAll(async () => {
    await db!.delete(runs).where(eq(runs.id, RUN));
    await db!.delete(users).where(eq(users.address, A));
    await client!.end();
  });

  it("refuses to end a run without its token", async () => {
    expect((await finish({})).status).toBe(403);
    expect((await finish({ [RUN_TOKEN_HEADER]: "someone-else" })).status).toBe(403);
    expect((await row()).endedAt).toBeNull();
  });

  it("ends the run once; a repeat moves nothing and adds no distance", async () => {
    const first = await finish({ [RUN_TOKEN_HEADER]: TOKEN }, 500);
    expect(first.status).toBe(200);
    const ended = await row();
    expect(ended.endedAt).not.toBeNull();
    expect(ended.distanceMeters).toBe(500);

    const again = await finish({ [RUN_TOKEN_HEADER]: TOKEN }, 200_000);
    expect(again.status).toBe(200);
    const body = (await again.json()) as { distanceMeters: number };
    expect(body.distanceMeters).toBe(500);
    const after = await row();
    expect(after.endedAt?.getTime()).toBe(ended.endedAt?.getTime());
    expect(after.distanceMeters).toBe(500);
  });
});
