import { and, asc, count, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { type Address, type Hex, parseAbiItem, decodeEventLog } from "viem";
import { challengeEntries, challenges, type Challenge } from "@/lib/db/schema";
import { poolAmount } from "@/lib/challenges/math";
import { dropsPublicClient } from "@/lib/drops/claim";
import { dropsAddress } from "@/lib/drops/config";
import { createLogger } from "@/lib/logger";

const log = createLogger("challenges");

type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/** Senders whose transfers to the contract are funding, never entries. */
function excludedSenders(): Set<string> {
  const raw = process.env.CHALLENGE_EXCLUDED_SENDERS ?? "";
  const list = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  // The relayer funds and pays; it never plays.
  list.push("0x8da26ae1b32a7e4cd158622d7d70fe16d6f1de83");
  return new Set(list);
}

/** Entries go to the MiniKlaimDrops contract, which also pays the winners. */
export function challengeDepositAddress(): Address | null {
  return dropsAddress();
}

export type ChallengeView = {
  id: string;
  title: { en: string; es: string };
  badgeIds: number[];
  token: string;
  entryAmount: string;
  winners: number;
  opensAt: string;
  entryClosesAt: string;
  closesAt: string;
  drawBlock: number;
  status: string;
  entrants: number;
  pool: string;
  result: unknown;
};

export async function entriesTotal(database: Db, challengeId: string) {
  const [row] = await database
    .select({
      n: count(),
      total: sql<string>`coalesce(sum(${challengeEntries.amount}), 0)::text`,
    })
    .from(challengeEntries)
    .where(eq(challengeEntries.challengeId, challengeId));
  return { entrants: row?.n ?? 0, total: BigInt(row?.total ?? "0") };
}

export function challengePool(c: Challenge, entries: bigint): bigint {
  return poolAmount({
    seed: BigInt(c.seedAmount),
    carry: BigInt(c.carryAmount),
    entries,
    poolBps: c.poolBps,
  });
}

export async function viewOf(database: Db, c: Challenge): Promise<ChallengeView> {
  const { entrants, total } = await entriesTotal(database, c.id);
  return {
    id: c.id,
    title: { en: c.titleEn, es: c.titleEs },
    badgeIds: c.badgeIds,
    token: c.token,
    entryAmount: c.entryAmount,
    winners: c.winners,
    opensAt: c.opensAt.toISOString(),
    entryClosesAt: c.entryClosesAt.toISOString(),
    closesAt: c.closesAt.toISOString(),
    drawBlock: c.drawBlock,
    status: c.status,
    entrants,
    pool: challengePool(c, total).toString(),
    result: c.result ?? null,
  };
}

/**
 * The challenge to show now: the one open for entries or still running, else
 * the most recent one closed in the last 7 days (to show its result).
 */
export async function currentChallenge(database: Db, now: Date): Promise<Challenge | null> {
  const [live] = await database
    .select()
    .from(challenges)
    .where(and(lte(challenges.opensAt, now), gt(challenges.closesAt, now)))
    .orderBy(asc(challenges.closesAt))
    .limit(1);
  if (live) return live;
  const [recent] = await database
    .select()
    .from(challenges)
    .where(and(lte(challenges.closesAt, now), gt(challenges.closesAt, new Date(now.getTime() - 7 * 86_400_000))))
    .orderBy(sql`${challenges.closesAt} desc`)
    .limit(1);
  return recent ?? null;
}

export async function hasEntered(database: Db, challengeId: string, players: string[]): Promise<boolean> {
  if (players.length === 0) return false;
  const [row] = await database
    .select({ id: challengeEntries.id })
    .from(challengeEntries)
    .where(and(eq(challengeEntries.challengeId, challengeId), inArray(challengeEntries.player, players)))
    .limit(1);
  return !!row;
}

export type EntryCheck =
  | { ok: true; player: string; amount: bigint; blockNumber: bigint; at: Date }
  | { ok: false; reason: "pending" | "reverted" | "no-transfer" | "wrong-amount" | "outside-window" | "excluded" };

/**
 * Read an entry from the chain: a successful transfer of exactly the entry
 * amount, in the challenge token, to the deposit address, mined inside the
 * entry window. Never trusts the client beyond the tx hash.
 */
export async function checkEntryTx(c: Challenge, txHash: Hex, deposit: Address): Promise<EntryCheck> {
  const client = dropsPublicClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) return { ok: false, reason: "pending" };
  if (receipt.status !== "success") return { ok: false, reason: "reverted" };
  let found: { from: string; value: bigint } | null = null;
  for (const l of receipt.logs) {
    if (l.address.toLowerCase() !== c.token.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: [TRANSFER], data: l.data, topics: l.topics }) as {
        args: { from: Address; to: Address; value: bigint };
      };
      if (ev.args.to.toLowerCase() === deposit.toLowerCase()) {
        found = { from: ev.args.from.toLowerCase(), value: ev.args.value };
        break;
      }
    } catch {
      // Not a Transfer.
    }
  }
  if (!found) return { ok: false, reason: "no-transfer" };
  if (found.value !== BigInt(c.entryAmount)) return { ok: false, reason: "wrong-amount" };
  if (excludedSenders().has(found.from)) return { ok: false, reason: "excluded" };
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const at = new Date(Number(block.timestamp) * 1000);
  if (at < c.opensAt || at > c.entryClosesAt) return { ok: false, reason: "outside-window" };
  return { ok: true, player: found.from, amount: found.value, blockNumber: receipt.blockNumber, at };
}

/** Insert a verified entry. One per player per challenge; a second payment is not an entry. */
export async function recordEntry(
  database: Db,
  c: Challenge,
  txHash: Hex,
  e: { player: string; amount: bigint; blockNumber: bigint; at: Date },
): Promise<"entered" | "duplicate"> {
  const rows = await database
    .insert(challengeEntries)
    .values({
      challengeId: c.id,
      player: e.player,
      txHash: txHash.toLowerCase(),
      amount: e.amount.toString(),
      blockNumber: Number(e.blockNumber),
      enteredAt: e.at,
    })
    .onConflictDoNothing()
    .returning({ id: challengeEntries.id });
  if (rows.length === 0) return "duplicate";
  log.warn("challenge entry", { challengeId: c.id, player: e.player, txHash });
  return "entered";
}

/**
 * Pick up entries whose POST never reached us (app closed after paying):
 * scan the token's Transfer logs to the deposit address in [fromBlock,
 * toBlock], in the 5,000-block chunks the public RPC allows.
 */
export async function syncEntries(
  database: Db,
  c: Challenge,
  deposit: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<{ scanned: number; entered: number; skipped: Record<string, number> }> {
  const client = dropsPublicClient();
  const out = { scanned: 0, entered: 0, skipped: {} as Record<string, number> };
  for (let start = fromBlock; start <= toBlock; start += 5000n) {
    const end = start + 4999n < toBlock ? start + 4999n : toBlock;
    const logs = await client.getLogs({
      address: c.token as Address,
      event: TRANSFER,
      args: { to: deposit },
      fromBlock: start,
      toBlock: end,
    });
    for (const l of logs) {
      out.scanned++;
      const check = await checkEntryTx(c, l.transactionHash, deposit);
      if ("reason" in check) {
        out.skipped[check.reason] = (out.skipped[check.reason] ?? 0) + 1;
        continue;
      }
      if ((await recordEntry(database, c, l.transactionHash, check)) === "entered") out.entered++;
      else out.skipped.duplicate = (out.skipped.duplicate ?? 0) + 1;
    }
  }
  return out;
}

/**
 * Money owed by challenges not paid yet (their pools), in `token`. Treasure
 * creation must leave this much of the contract's free balance alone.
 */
export async function owedToChallenges(database: Db, token: string): Promise<bigint> {
  const open = await database
    .select()
    .from(challenges)
    .where(and(inArray(challenges.status, ["open", "closed"]), sql`lower(${challenges.token}) = ${token.toLowerCase()}`));
  let owed = 0n;
  for (const c of open) {
    const { total } = await entriesTotal(database, c.id);
    owed += challengePool(c, total);
  }
  return owed;
}
