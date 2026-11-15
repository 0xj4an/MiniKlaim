import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { users } from "@/lib/db/schema";

// TEST_DATABASE_URL=postgresql://... npx vitest run lib/playerConquests.db.test.ts
const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;
const client = url ? postgres(url, { prepare: false, max: 2 }) : null;
const db = client ? drizzle(client) : null;

const A = "0x00000000000000000000000000000000000c0a01";
const B = "0x00000000000000000000000000000000000c0a02";
const NOBODY = "0x00000000000000000000000000000000000c0a03";

describe.skipIf(!db)("conquestsOf", () => {
  beforeEach(async () => {
    await db!.delete(users).where(inArray(users.address, [A, B, NOBODY]));
    await db!.insert(users).values([
      { address: A, conquests: 728 },
      { address: B, conquests: 251 },
    ]);
  });
  afterAll(async () => {
    await db!.delete(users).where(inArray(users.address, [A, B, NOBODY]));
    await client!.end();
  });

  // The public profile read one wallet (728) while /stats added both (979).
  it("adds up every linked wallet", async () => {
    const { conquestsOf } = await import("@/lib/playerConquests");
    expect(await conquestsOf([A, B])).toBe(979);
  });

  it("is the wallet's own count when nothing is linked", async () => {
    const { conquestsOf } = await import("@/lib/playerConquests");
    expect(await conquestsOf([A])).toBe(728);
  });

  it("is zero for a wallet that never played and for no wallets", async () => {
    const { conquestsOf } = await import("@/lib/playerConquests");
    expect(await conquestsOf([NOBODY])).toBe(0);
    expect(await conquestsOf([])).toBe(0);
  });
});
