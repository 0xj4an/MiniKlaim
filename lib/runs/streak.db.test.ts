import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runs, users } from "@/lib/db/schema";

// Each run's streak day is cut in the zone that run was played in.
// TEST_DATABASE_URL=postgresql://... npx vitest run lib/runs/streak.db.test.ts
// CI has no database, so it is skipped there.
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { prepare: false, max: 2 }) : null;
const db = client ? drizzle(client) : null;

const A = "0x00000000000000000000000000000000005d0d01";

let streakDays: typeof import("./streak").streakDays;

describe.skipIf(!db)("streakDays (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ streakDays } = await import("./streak"));
  });

  beforeEach(async () => {
    await db!.delete(runs).where(inArray(runs.userAddress, [A]));
    await db!.delete(users).where(inArray(users.address, [A]));
  });

  afterAll(async () => {
    await db!.delete(runs).where(inArray(runs.userAddress, [A]));
    await db!.delete(users).where(inArray(users.address, [A]));
    await client!.end();
  });

  it("keeps a day played in India in India after the player flies home", async () => {
    // Back in Bogota now, which is the zone saved on the wallet.
    await db!.insert(users).values({ address: A, timeZone: "America/Bogota" });
    await db!.insert(runs).values([
      {
        // 7 Nov, 09:58 in India. In Bogota time it is still 6 Nov, 23:28.
        userAddress: A,
        timeZone: "Asia/Calcutta",
        startedAt: new Date("2026-11-07T04:14:00Z"),
        endedAt: new Date("2026-11-07T04:28:00Z"),
        hexesClaimed: 5,
      },
      {
        // No zone on the run (an old one): cut in the wallet's latest zone.
        userAddress: A,
        startedAt: new Date("2026-11-09T05:11:00Z"),
        endedAt: new Date("2026-11-09T05:15:00Z"),
        hexesClaimed: 5,
      },
      {
        userAddress: A,
        timeZone: "America/Bogota",
        startedAt: new Date("2026-11-16T01:23:00Z"),
        endedAt: new Date("2026-11-16T01:32:00Z"),
        hexesClaimed: 5,
      },
    ]);
    const got = await streakDays([A]);
    expect(got.timeZone).toBe("America/Bogota");
    expect(got.days).toEqual(["2026-11-15", "2026-11-09", "2026-11-07"]);
  });

  it("leaves out a run that did nothing", async () => {
    await db!.insert(users).values({ address: A, timeZone: "UTC" });
    await db!.insert(runs).values({
      userAddress: A,
      timeZone: "UTC",
      startedAt: new Date("2026-11-10T10:00:00Z"),
      endedAt: new Date("2026-11-10T10:01:00Z"),
    });
    expect((await streakDays([A])).days).toEqual([]);
  });
});
