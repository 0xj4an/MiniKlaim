import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { encodeAbiParameters, type Hex, keccak256, toBytes } from "viem";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { challengeEntries, challenges } from "@/lib/db/schema";

// Fake chain: receipts and blocks keyed by tx hash.
const chain = vi.hoisted(() => ({
  receipts: new Map<string, unknown>(),
  blockTime: new Map<bigint, bigint>(),
}));
vi.mock("@/lib/drops/claim", () => ({
  dropsPublicClient: () => ({
    getTransactionReceipt: async ({ hash }: { hash: string }) => {
      const r = chain.receipts.get(hash);
      if (!r) throw new Error("not found");
      return r;
    },
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
      timestamp: chain.blockTime.get(blockNumber) ?? 0n,
    }),
  }),
}));

const { checkEntryTx, currentChallenge, hasEntered, owedToChallenges, recordEntry, viewOf } = await import(
  "@/lib/challenges/server"
);

// TEST_DATABASE_URL=postgresql://... npx vitest run lib/challenges/server.db.test.ts
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { prepare: false, max: 2 }) : null;
const db = client ? drizzle(client) : null;

const USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";
const DEPOSIT = "0x19cE0B7C48608286A7872147f89F70896D0e67c6";
const PLAYER = "0x00000000000000000000000000000000000000c1";
const ID = "test-week";
const T0 = new Date("2026-11-09T00:00:00Z");
const sec = (d: Date) => BigInt(Math.floor(d.getTime() / 1000));
const TRANSFER_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));
const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}` as Hex;

function fakeTransfer(hash: string, opts: { from?: string; to?: string; value?: bigint; token?: string; at?: Date; status?: string }) {
  const block = BigInt(chain.receipts.size + 1000);
  chain.blockTime.set(block, sec(opts.at ?? new Date(T0.getTime() + 3_600_000)));
  chain.receipts.set(hash, {
    status: opts.status ?? "success",
    blockNumber: block,
    logs: [
      {
        address: opts.token ?? USDT,
        topics: [TRANSFER_TOPIC, pad(opts.from ?? PLAYER), pad(opts.to ?? DEPOSIT)],
        data: encodeAbiParameters([{ type: "uint256" }], [opts.value ?? 1_000_000n]),
      },
    ],
  });
}
const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

describe.skipIf(!db)("challenges (database)", () => {
  let c: typeof challenges.$inferSelect;
  beforeEach(async () => {
    chain.receipts.clear();
    chain.blockTime.clear();
    await db!.delete(challengeEntries).where(eq(challengeEntries.challengeId, ID));
    await db!.delete(challenges).where(eq(challenges.id, ID));
    [c] = await db!
      .insert(challenges)
      .values({
        id: ID,
        titleEn: "First badges",
        titleEs: "Primeras badges",
        badgeIds: [10, 1, 34, 48],
        token: USDT,
        entryAmount: "1000000",
        seedAmount: "1000000",
        winners: 10,
        opensAt: T0,
        entryClosesAt: new Date(T0.getTime() + 3 * 86_400_000),
        closesAt: new Date(T0.getTime() + 7 * 86_400_000),
        drawBlock: 99,
      })
      .returning();
  });
  afterAll(async () => {
    await db?.delete(challengeEntries).where(eq(challengeEntries.challengeId, ID));
    await db?.delete(challenges).where(eq(challenges.id, ID));
    await client?.end();
  });

  it("accepts an exact transfer to the deposit inside the window", async () => {
    fakeTransfer(h(1), {});
    const check = await checkEntryTx(c, h(1), DEPOSIT);
    expect(check).toMatchObject({ ok: true, player: PLAYER, amount: 1_000_000n });
    if (!("reason" in check)) {
      expect(await recordEntry(db!, c, h(1), check)).toBe("entered");
      expect(await recordEntry(db!, c, h(1), check)).toBe("duplicate");
    }
    expect(await hasEntered(db!, ID, [PLAYER])).toBe(true);
    const view = await viewOf(db!, c);
    expect(view.entrants).toBe(1);
    expect(view.pool).toBe("1800000"); // 1 seed + 80% of 1
    // Only the seed sits in the contract; entries reach it at payout.
    expect(await owedToChallenges(db!, USDT)).toBe(1_000_000n);
  });

  it("refuses anything else", async () => {
    fakeTransfer(h(2), { value: 5_000_000n });
    fakeTransfer(h(3), { to: "0x0000000000000000000000000000000000000bad" });
    fakeTransfer(h(4), { at: new Date(T0.getTime() + 4 * 86_400_000) });
    fakeTransfer(h(5), { status: "reverted" });
    fakeTransfer(h(6), { token: "0x765DE816845861e75A25fCA122bb6898B8B1282a" });
    fakeTransfer(h(7), { from: "0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83" });
    const reasons = [];
    for (let i = 2; i <= 8; i++) {
      const r = await checkEntryTx(c, h(i), DEPOSIT);
      reasons.push("reason" in r ? r.reason : "ok");
    }
    expect(reasons).toEqual(["wrong-amount", "no-transfer", "outside-window", "reverted", "no-transfer", "excluded", "pending"]);
  });

  it("one entry per player: a second payment is not an entry", async () => {
    fakeTransfer(h(10), {});
    fakeTransfer(h(11), {});
    for (const tx of [h(10), h(11)]) {
      const check = await checkEntryTx(c, tx, DEPOSIT);
      if (!("reason" in check)) await recordEntry(db!, c, tx, check);
    }
    expect((await viewOf(db!, c)).entrants).toBe(1);
  });

  it("shows the running challenge, then the closed one for a week", async () => {
    expect((await currentChallenge(db!, new Date(T0.getTime() + 86_400_000)))?.id).toBe(ID);
    expect((await currentChallenge(db!, new Date(T0.getTime() + 8 * 86_400_000)))?.id).toBe(ID);
    expect(await currentChallenge(db!, new Date(T0.getTime() + 20 * 86_400_000))).toBeNull();
  });
});
