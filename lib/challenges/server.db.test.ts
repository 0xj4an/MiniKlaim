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
  /** Blocks a lagging node does not have yet: reads left to fail, by block. */
  blockMisses: new Map<bigint, number>(),
}));
vi.mock("@/lib/drops/claim", () => ({
  dropsPublicClient: () => ({
    getTransactionReceipt: async ({ hash }: { hash: string }) => {
      const r = chain.receipts.get(hash);
      if (!r) throw new Error("not found");
      return r;
    },
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => {
      const misses = chain.blockMisses.get(blockNumber) ?? 0;
      if (misses > 0) {
        chain.blockMisses.set(blockNumber, misses - 1);
        throw new Error(`Block at number "${blockNumber}" could not be found.`);
      }
      return { timestamp: chain.blockTime.get(blockNumber) ?? 0n };
    },
  }),
}));

process.env.NEXT_PUBLIC_CELO_DROPS_ADDRESS = "0x19cE0B7C48608286A7872147f89F70896D0e67c6";
const { challengeKey } = await import("@/lib/challenges/allowance");
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
const ENTERED_TOPIC = keccak256(toBytes("ChallengeEntered(bytes32,address,address,uint256)"));
function fakeEnterFor(hash: string, opts: { player?: string; value?: bigint; key?: Hex; at?: Date; from?: string }) {
  const block = BigInt(chain.receipts.size + 2000);
  chain.blockTime.set(block, sec(opts.at ?? new Date(T0.getTime() + 3_600_000)));
  chain.receipts.set(hash, {
    status: "success",
    blockNumber: block,
    logs: [
      {
        address: opts.from ?? DEPOSIT,
        topics: [ENTERED_TOPIC, opts.key ?? challengeKey(ID), pad(opts.player ?? PLAYER), pad(USDT)],
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
    chain.blockMisses.clear();
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
    expect(await owedToChallenges(db!, USDT)).toBe(1_800_000n);
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

  it("reads an allowance entry from the contract's event", async () => {
    fakeEnterFor(h(20), {});
    expect(await checkEntryTx(c, h(20), "0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83")).toMatchObject({
      ok: true,
      player: PLAYER,
      amount: 1_000_000n,
    });
    fakeEnterFor(h(21), { key: challengeKey("another-week") });
    fakeEnterFor(h(22), { from: "0x0000000000000000000000000000000000000bad" });
    fakeEnterFor(h(23), { at: new Date(T0.getTime() + 4 * 86_400_000) });
    const r = [];
    for (const i of [21, 22, 23]) {
      const x = await checkEntryTx(c, h(i), "0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83");
      r.push("reason" in x ? x.reason : "ok");
    }
    expect(r).toEqual(["no-transfer", "no-transfer", "outside-window"]);
  });

  it("waits for a block the node does not have yet", async () => {
    fakeEnterFor(h(30), {});
    const receipt = chain.receipts.get(h(30)) as { blockNumber: bigint };
    chain.blockMisses.set(receipt.blockNumber, 2);
    expect(await checkEntryTx(c, h(30), DEPOSIT)).toMatchObject({ ok: true, player: PLAYER, amount: 1_000_000n });
    expect(chain.blockMisses.get(receipt.blockNumber)).toBe(0);
  });

  it("gives up on a block that never shows", async () => {
    fakeEnterFor(h(31), {});
    const receipt = chain.receipts.get(h(31)) as { blockNumber: bigint };
    chain.blockMisses.set(receipt.blockNumber, 1000);
    await expect(checkEntryTx(c, h(31), DEPOSIT)).rejects.toThrow("could not be found");
  }, 10_000);

  it("reads the receipt it is handed instead of asking the node again", async () => {
    fakeEnterFor(h(32), {});
    const receipt = chain.receipts.get(h(32)) as Parameters<typeof checkEntryTx>[3];
    // The node asked for the receipt does not have the transaction yet.
    chain.receipts.delete(h(32));
    expect(await checkEntryTx(c, h(32), DEPOSIT)).toEqual({ ok: false, reason: "pending" });
    expect(await checkEntryTx(c, h(32), DEPOSIT, receipt)).toMatchObject({ ok: true, player: PLAYER });
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
