import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { isValidCell, getResolution, latLngToCell } from "h3-js";
import postgres from "postgres";
import { encodeFunctionData, type Hex, parseUnits } from "viem";
import { dropFinds, drops } from "../lib/db/schema";
import { DROPS_ABI, DROPS_READ_ABI, dropsPublicClient, sendDropsTx } from "../lib/drops/claim";
import { DROP_TOKENS, type DropTokenSymbol, dropTokenByAddress, dropsAddress } from "../lib/drops/config";
import { awardFind, clearDropIndex } from "../lib/drops/detect";
import { dropCommitment, dropIdToUint, h3ToUint64, hintCell } from "../lib/drops/ids";

/**
 * Treasure admin for the pilot (no admin panel yet).
 *
 *   npx tsx scripts/drops.ts plan    <spots.json>             # prints cells, no writes
 *   npx tsx scripts/drops.ts create  <spots.json> --execute   # DB + onchain createDrop
 *   npx tsx scripts/drops.ts list                             # drops and finds
 *   npx tsx scripts/drops.ts balance                          # contract free / committed
 *   npx tsx scripts/drops.ts approve <findId> --execute       # flagged find wins
 *   npx tsx scripts/drops.ts reject  <findId> --execute
 *   npx tsx scripts/drops.ts update  <dropId> [--amount 2] [--winners 5] --execute
 *                                                            # change an open treasure
 *   npx tsx scripts/drops.ts refill  <dropId> [--amount 1] [--winners 3] [--days 14] --execute
 *                                                            # closed spot gets a new prize
 *   npx tsx scripts/drops.ts expire  <dropId> --execute       # onchain expire, frees funds
 *   npx tsx scripts/drops.ts reveal  <dropId> --execute       # publish the block after close
 *
 * spots.json holds the hidden blocks, so it never goes in this public repo:
 *   { "batch": "city-1", "token": "USDT", "amount": "1", "winners": 1,
 *     "startsAt": "2026-11-06T03:30:00Z", "endsAt": "2026-11-20T03:30:00Z",
 *     "sponsor": "MiniKlaim",
 *     "spots": [ { "label": "Main square", "clue": "By the fountain", "lat": 0.0, "lng": 0.0 },
 *                { "label": "Station", "winners": 5, "h3": "<res-12 cell>" } ] }
 * `amount` is the prize per winner; `winners` (batch default, per-spot override)
 * is how many players can win each treasure, one prize each.
 * A spot with `h3` uses that res-12 cell; one with lat/lng uses the cell there.
 *
 * Env: DATABASE_URL, SERVER_SIGNER_PRIVATE_KEY (holds REWARDER_ROLE),
 * NEXT_PUBLIC_CELO_DROPS_ADDRESS. The contract must be funded before create.
 */

type Spot = { label: string; clue?: string; winners?: number; h3?: string; lat?: number; lng?: number };
type SpotsFile = {
  batch: string;
  token: DropTokenSymbol;
  amount: string;
  /** Winners per treasure, one prize each. Default 1; a spot can override it. */
  winners?: number;
  startsAt: string;
  endsAt: string;
  sponsor?: string;
  spots: Spot[];
};

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const client = postgres(url, { prepare: false, max: 2 });
const db = drizzle(client);

const [cmd, arg, ...rest] = process.argv.slice(2);
const execute = rest.includes("--execute") || arg === "--execute";
function flag(name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function cellFor(spot: Spot): string {
  if (spot.h3) {
    if (!isValidCell(spot.h3) || getResolution(spot.h3) !== 12) throw new Error(`${spot.label}: not a res-12 cell`);
    return spot.h3;
  }
  if (typeof spot.lat !== "number" || typeof spot.lng !== "number") throw new Error(`${spot.label}: needs h3 or lat/lng`);
  return latLngToCell(spot.lat, spot.lng, 12);
}

function readSpots(path: string): SpotsFile {
  const f = JSON.parse(readFileSync(path, "utf8")) as SpotsFile;
  if (!DROP_TOKENS[f.token]) throw new Error(`token must be one of ${Object.keys(DROP_TOKENS).join(", ")}`);
  if (!(new Date(f.endsAt) > new Date(f.startsAt))) throw new Error("endsAt must be after startsAt");
  const cells = f.spots.map(cellFor);
  if (new Set(cells).size !== cells.length) throw new Error("two spots share a cell");
  return f;
}

async function waitOk(hash: Hex) {
  const receipt = await dropsPublicClient().waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
}

async function plan(path: string) {
  const f = readSpots(path);
  const unit = parseUnits(f.amount, DROP_TOKENS[f.token].decimals);
  let total = 0n;
  for (const s of f.spots) {
    const cell = cellFor(s);
    const winners = s.winners ?? f.winners ?? 1;
    total += unit * BigInt(winners);
    console.log(`  ${s.label.padEnd(28)} ${cell}  x${winners}  hint ${hintCell(cell)}  ${s.clue || "(no clue)"}`);
  }
  console.log(`batch ${f.batch}: ${f.spots.length} spots, ${f.amount} ${f.token} per winner, ${total} base units in all`);
}

async function create(path: string) {
  const f = readSpots(path);
  const contract = dropsAddress();
  if (!contract) throw new Error("NEXT_PUBLIC_CELO_DROPS_ADDRESS not set");
  const token = DROP_TOKENS[f.token].address;
  const amount = parseUnits(f.amount, DROP_TOKENS[f.token].decimals);
  const free = await dropsPublicClient().readContract({
    address: contract,
    abi: DROPS_READ_ABI,
    functionName: "freeBalance",
    args: [token],
    authorizationList: undefined,
  });
  const winnersOf = (sp: Spot) => sp.winners ?? f.winners ?? 1;
  const need = f.spots.reduce((sum, sp) => sum + amount * BigInt(winnersOf(sp)), 0n);
  console.log(`free ${free}, need ${need} (${f.token} base units)`);
  if (free < need) throw new Error("fund the contract first");
  if (!execute) {
    console.log("dry run: pass --execute to write");
    return;
  }
  for (const s of f.spots) {
    const id = await openDrop({
      h3: cellFor(s),
      label: s.label,
      clue: s.clue ?? null,
      token,
      amount,
      maxWinners: winnersOf(s),
      startsAt: new Date(f.startsAt),
      endsAt: new Date(f.endsAt),
      sponsor: f.sponsor ?? null,
      batch: f.batch,
    });
    console.log(`  ${s.label}: ${id}`);
  }
}

/** Insert a drop, register it onchain and mark it active. */
async function openDrop(p: {
  h3: string;
  label: string | null;
  clue: string | null;
  token: Hex;
  amount: bigint;
  maxWinners: number;
  startsAt: Date;
  endsAt: Date;
  sponsor: string | null;
  batch: string | null;
}): Promise<string> {
  const salt = `0x${randomBytes(32).toString("hex")}` as Hex;
  const [row] = await db
    .insert(drops)
    .values({
      h3: p.h3,
      hintH3: hintCell(p.h3),
      label: p.label,
      clue: p.clue,
      token: p.token,
      amount: p.amount.toString(),
      maxWinners: p.maxWinners,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      salt,
      commitment: "0x",
      status: "draft",
      sponsor: p.sponsor,
      batch: p.batch,
    })
    .returning({ id: drops.id });
  const commitment = dropCommitment(row.id, p.h3, salt);
  const data = encodeFunctionData({
    abi: DROPS_ABI,
    functionName: "createDrop",
    args: [dropIdToUint(row.id), p.token, p.amount, BigInt(p.maxWinners), commitment],
  });
  const tx = await sendDropsTx(data);
  await waitOk(tx);
  await db.update(drops).set({ commitment, createTx: tx, status: "active" }).where(eq(drops.id, row.id));
  console.log(`    created ${row.id} tx ${tx}`);
  return row.id;
}

/**
 * Reopen a spot: a closed treasure (claimed, found or expired) gets a new
 * prize at the same block. It is a new drop with its own id, commitment and
 * one winner; whoever passes first wins again, the previous winner included.
 * Never refill a spot whose block was revealed: the block is public then.
 */
async function refill(dropId: string) {
  const [old] = await db.select().from(drops).where(eq(drops.id, dropId));
  if (!old) throw new Error("drop not found");
  if (!["claimed", "found", "expired"].includes(old.status)) throw new Error(`drop is ${old.status}, not closed`);
  const [open] = await db
    .select({ id: drops.id })
    .from(drops)
    .where(and(eq(drops.h3, old.h3), inArray(drops.status, ["draft", "active"])));
  if (open) throw new Error(`spot already has an open drop: ${open.id}`);

  const sym = dropTokenByAddress(old.token);
  if (!sym) throw new Error("token not in the allowlist");
  const amountArg = flag("--amount");
  const amount = amountArg ? parseUnits(amountArg, DROP_TOKENS[sym].decimals) : BigInt(old.amount);
  const days = Number(flag("--days") ?? (old.endsAt.getTime() - old.startsAt.getTime()) / 86_400_000);
  const maxWinners = Number(flag("--winners") ?? old.maxWinners);
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + days * 86_400_000);
  console.log(`refill ${old.label ?? old.id}: ${amount} ${sym} base units x${maxWinners}, until ${endsAt.toISOString()}`);
  console.log("  do not reveal the old drop of a spot you keep refilling: reveal publishes the block");
  if (!execute) return console.log("dry run: pass --execute");
  await openDrop({
    h3: old.h3,
    label: old.label,
    clue: old.clue,
    token: old.token as Hex,
    amount,
    maxWinners,
    startsAt,
    endsAt,
    sponsor: old.sponsor,
    batch: old.batch,
  });
  clearDropIndex();
}

/**
 * Change an open treasure: prize per winner (--amount) and number of winners
 * (--winners). Applies to winners not paid yet. More winners on a drop whose
 * slots were all awarded reopens it; fewer than already awarded is refused.
 * The contract checks the free balance for any increase.
 */
async function update(dropId: string) {
  const [d] = await db.select().from(drops).where(eq(drops.id, dropId));
  if (!d) throw new Error("drop not found");
  if (!["active", "found"].includes(d.status)) throw new Error(`drop is ${d.status}; use refill for a closed spot`);
  const sym = dropTokenByAddress(d.token);
  if (!sym) throw new Error("token not in the allowlist");
  const amountArg = flag("--amount");
  const amount = amountArg ? parseUnits(amountArg, DROP_TOKENS[sym].decimals) : BigInt(d.amount);
  const maxWinners = Number(flag("--winners") ?? d.maxWinners);
  if (!Number.isInteger(maxWinners) || maxWinners < 0) throw new Error("--winners must be a whole number");
  const awarded = (
    await db
      .select({ id: dropFinds.id })
      .from(dropFinds)
      .where(and(eq(dropFinds.dropId, d.id), eq(dropFinds.review, "ok")))
  ).length;
  if (maxWinners < awarded) throw new Error(`${awarded} players already won; --winners cannot go below that`);
  console.log(`update ${d.label ?? d.id}: ${d.amount} -> ${amount} ${sym} base units, winners ${d.maxWinners} -> ${maxWinners} (${awarded} awarded)`);
  if (!execute) return console.log("dry run: pass --execute");
  const tx = await sendDropsTx(
    encodeFunctionData({
      abi: DROPS_ABI,
      functionName: "updateDrop",
      args: [dropIdToUint(d.id), amount, BigInt(maxWinners)],
    }),
  );
  await waitOk(tx);
  const status = awarded >= maxWinners ? (awarded === 0 ? "expired" : "found") : "active";
  await db
    .update(drops)
    .set({ amount: amount.toString(), maxWinners, status })
    .where(eq(drops.id, d.id));
  clearDropIndex();
  console.log(`updated: ${tx} (now ${status})`);
}

async function list() {
  const rows = await db.select().from(drops).orderBy(desc(drops.createdAt));
  for (const d of rows) {
    console.log(`${d.id} ${d.status.padEnd(9)} ${d.label ?? ""} ${d.amount} ${d.token} x${d.maxWinners}`);
    const finds = await db.select().from(dropFinds).where(eq(dropFinds.dropId, d.id));
    for (const x of finds) {
      console.log(
        `   find ${x.id} ${x.review}${x.reviewReason ? `(${x.reviewReason})` : ""} ${x.player} run ${x.runId} acc ${x.accuracyM ?? "-"} batches ${x.nearBatches} tx ${x.claimTx ?? "-"}`,
      );
    }
  }
}

async function balance() {
  const contract = dropsAddress();
  if (!contract) throw new Error("NEXT_PUBLIC_CELO_DROPS_ADDRESS not set");
  for (const [sym, t] of Object.entries(DROP_TOKENS)) {
    const read = (fn: "freeBalance" | "committed") =>
      dropsPublicClient().readContract({ address: contract, abi: DROPS_READ_ABI, functionName: fn, args: [t.address], authorizationList: undefined });
    const [free, committed] = await Promise.all([read("freeBalance"), read("committed")]);
    console.log(`${sym}: free ${free}, committed ${committed}`);
  }
}

async function review(findId: string, verdict: "approve" | "reject") {
  const [f] = await db.select().from(dropFinds).where(eq(dropFinds.id, findId));
  if (!f) throw new Error("find not found");
  console.log(`find ${f.id}: ${f.review} ${f.reviewReason ?? ""} player ${f.player}`);
  if (!execute) return console.log("dry run: pass --execute");
  if (verdict === "reject") {
    await db.update(dropFinds).set({ review: "rejected", reviewReason: "admin" }).where(eq(dropFinds.id, findId));
  } else {
    const won = await awardFind(db, f.dropId, f.id, new Date());
    console.log(won ? "awarded" : "drop no longer open: marked late");
  }
  clearDropIndex();
}

async function onchain(dropId: string, action: "expire" | "reveal") {
  const [d] = await db.select().from(drops).where(eq(drops.id, dropId));
  if (!d) throw new Error("drop not found");
  console.log(`drop ${d.id} ${d.status} ${d.label ?? ""}`);
  if (!execute) return console.log("dry run: pass --execute");
  const data =
    action === "expire"
      ? encodeFunctionData({ abi: DROPS_ABI, functionName: "expireDrop", args: [dropIdToUint(d.id)] })
      : encodeFunctionData({
          abi: DROPS_ABI,
          functionName: "reveal",
          args: [dropIdToUint(d.id), h3ToUint64(d.h3), d.salt as Hex],
        });
  const tx = await sendDropsTx(data);
  await waitOk(tx);
  if (action === "expire") await db.update(drops).set({ status: "expired" }).where(eq(drops.id, d.id));
  console.log(`${action}: ${tx}`);
}

async function main() {
  switch (cmd) {
    case "plan":
      return plan(arg);
    case "create":
      return create(arg);
    case "list":
      return list();
    case "balance":
      return balance();
    case "approve":
    case "reject":
      return review(arg, cmd);
    case "refill":
      return refill(arg);
    case "update":
      return update(arg);
    case "expire":
    case "reveal":
      return onchain(arg, cmd);
    default:
      console.log("usage: plan|create <spots.json> | list | balance | approve|reject <findId> | update|refill|expire|reveal <dropId>  [--execute]");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
