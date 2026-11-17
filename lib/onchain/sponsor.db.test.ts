import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sponsoredMints } from "@/lib/db/schema";

// The daily sponsor allowances count items (blocks, badges, NFTs), not
// transactions. CI has no database, so it is skipped there:
// TEST_DATABASE_URL=postgresql://... npx vitest run lib/onchain/sponsor.db.test.ts
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { prepare: false, max: 2 }) : null;
const db = client ? drizzle(client) : null;

const A = "0x00000000000000000000000000000000000d0d01";
const B = "0x00000000000000000000000000000000000d0d02";
const TX = `0x${"ab".repeat(32)}`;

let sponsoredLast24h: typeof import("./sponsor").sponsoredLast24h;

describe.skipIf(!db)("sponsoredLast24h (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ sponsoredLast24h } = await import("./sponsor"));
  });

  beforeEach(async () => {
    await db!.delete(sponsoredMints).where(inArray(sponsoredMints.userAddress, [A, B]));
  });

  afterAll(async () => {
    await db!.delete(sponsoredMints).where(inArray(sponsoredMints.userAddress, [A, B]));
    await client!.end();
  });

  it("adds up badges and NFTs one by one, per wallet and per kind", async () => {
    await db!.insert(sponsoredMints).values([
      { userAddress: A, kind: "badges", count: 2, txHash: TX },
      { userAddress: A, kind: "badges", count: 1, txHash: TX },
      { userAddress: A, kind: "tokens", count: 60, txHash: TX },
      { userAddress: A, kind: "tokens", count: 40, txHash: TX },
      { userAddress: B, kind: "tokens", count: 7, txHash: TX },
    ]);
    expect(await sponsoredLast24h(db as never, A, "badges")).toBe(3);
    expect(await sponsoredLast24h(db as never, A, "tokens")).toBe(100);
    expect(await sponsoredLast24h(db as never, B, "tokens")).toBe(7);
    expect(await sponsoredLast24h(db as never, B, "badges")).toBe(0);
  });

  it("forgets what is older than a day", async () => {
    await db!.insert(sponsoredMints).values([
      {
        userAddress: A,
        kind: "tokens",
        count: 100,
        txHash: TX,
        createdAt: new Date(Date.now() - 25 * 3600_000),
      },
      { userAddress: A, kind: "tokens", count: 5, txHash: TX },
    ]);
    expect(await sponsoredLast24h(db as never, A, "tokens")).toBe(5);
  });
});
