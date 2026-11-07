import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { type Address, encodeFunctionData, type Hex, keccak256, parseUnits, toBytes } from "viem";
import { challengeEntries, challenges, dropFinds, drops } from "../lib/db/schema";
import { blockAfter, drawWinners, prizePerWinner } from "../lib/challenges/math";
import { challengeDepositAddress, challengePool, entriesTotal, syncEntries } from "../lib/challenges/server";
import { CHALLENGE_ABI, challengeKey } from "../lib/challenges/allowance";
import { DROPS_ABI, DROPS_READ_ABI, dropsPublicClient, sendDropsTx, sendRelayerTokenTransfer } from "../lib/drops/claim";
import { DROP_TOKENS, type DropTokenSymbol, dropsAddress, dropTokenByAddress } from "../lib/drops/config";
import { dropIdToUint } from "../lib/drops/ids";
import { onchainBadgeIdsHeld } from "../lib/onchain/badges";
import { addressesForPlayer } from "../lib/players";

/**
 * Weekly challenge admin.
 *
 *   npx tsx scripts/challenges.ts create --id 2026-w46 --title-en "First badges" --title-es "Primeras badges" \
 *        --badges 10,1,34,48 --token USDT --entry 1 --seed 1 --winners 10 \
 *        --opens 2026-11-09T00:00:00Z --entry-closes 2026-11-11T23:59:59Z --closes 2026-11-16T00:00:00Z \
 *        [--carry 0] [--pool-bps 8000] --execute
 *   npx tsx scripts/challenges.ts list
 *   npx tsx scripts/challenges.ts register <id> --execute   # entry terms onchain (create does it too)
 *   npx tsx scripts/challenges.ts fee-recipient <address> --execute   # where the non-pool share goes
 *   npx tsx scripts/challenges.ts sync   <id> --execute     # register entries from the chain
 *   npx tsx scripts/challenges.ts draw   <id> --execute     # snapshot at the close + draw
 *   npx tsx scripts/challenges.ts payout <id> --execute     # one drop slot per winner
 *
 * Entries: the player approves the drops contract once (bounded, MiniPay caps
 * approvals at $10) and each entry is a tap that the relayer turns into
 * `enterFor`, which pulls exactly the fee into the contract and sends the
 * non-pool share to the contract's fee recipient at once. The terms must be
 * registered onchain first (`register`, or `create --execute`). Legacy exact
 * transfers to the deposit wallet still count; payout tops the contract up
 * from that wallet with whatever the pool is short. Fund the seed into the
 * drops contract with any amount.
 *
 * The draw block is fixed at create time (about 10 minutes after the close)
 * and its hash seeds the draw, so the result is reproducible by anyone:
 * qualified = entrants whose linked wallets hold every challenge badge when the
 * draw runs, whenever they were minted; winners = drawWinners(qualified,
 * hash(drawBlock), id, winners).
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const client = postgres(url, { prepare: false, max: 2 });
const db = drizzle(client);
const pub = dropsPublicClient();

const [cmd, arg, ...rest] = process.argv.slice(2);
const args = [arg, ...rest];
const execute = args.includes("--execute");
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
function need(name: string): string {
  const v = flag(name);
  if (!v) throw new Error(`missing ${name}`);
  return v;
}

/** First block whose timestamp is at or after `at`. */
async function blockAtTime(at: Date): Promise<bigint> {
  const target = BigInt(Math.floor(at.getTime() / 1000));
  const latest = await pub.getBlock();
  if (latest.timestamp < target) throw new Error("that time is in the future");
  let hi = latest.number;
  let lo = hi - (latest.timestamp - target) - 3600n;
  if (lo < 0n) lo = 0n;
  while ((await pub.getBlock({ blockNumber: lo })).timestamp > target) lo -= 3600n;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if ((await pub.getBlock({ blockNumber: mid })).timestamp < target) lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}

async function create() {
  const id = need("--id");
  const sym = (flag("--token") ?? "USDT") as DropTokenSymbol;
  const token = DROP_TOKENS[sym];
  if (!token) throw new Error("token must be USDT or COPm");
  const badgeIds = need("--badges").split(",").map((x) => Number(x.trim()));
  if (badgeIds.some((n) => !Number.isInteger(n) || n < 1 || n > 55)) throw new Error("bad --badges");
  const opensAt = new Date(need("--opens"));
  const entryClosesAt = new Date(need("--entry-closes"));
  const closesAt = new Date(need("--closes"));
  if (!(opensAt < entryClosesAt && entryClosesAt <= closesAt)) throw new Error("need opens < entry-closes <= closes");
  const winners = Number(need("--winners"));
  const poolBps = Number(flag("--pool-bps") ?? "8000");
  if (!Number.isInteger(poolBps) || poolBps < 0 || poolBps > 10_000) throw new Error("--pool-bps must be 0..10000");
  const latest = await pub.getBlockNumber();
  const drawBlock = blockAfter(latest, (closesAt.getTime() - Date.now()) / 1000);
  const row = {
    id,
    titleEn: need("--title-en"),
    titleEs: need("--title-es"),
    badgeIds,
    token: token.address,
    entryAmount: parseUnits(need("--entry"), token.decimals).toString(),
    seedAmount: parseUnits(need("--seed"), token.decimals).toString(),
    carryAmount: parseUnits(flag("--carry") ?? "0", token.decimals).toString(),
    winners,
    poolBps,
    opensAt,
    entryClosesAt,
    closesAt,
    drawBlock: Number(drawBlock),
  };
  console.log(JSON.stringify(row, null, 2));
  console.log(`draw block ${drawBlock} (now ${latest}): its hash will seed the draw`);
  if (!execute) return console.log("dry run: pass --execute");
  await db.insert(challenges).values(row);
  console.log("created");
  await register(id);
}

/** Where the non-pool share of every entry goes, from now on. */
async function setFeeRecipient(to: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(to ?? "")) throw new Error("usage: fee-recipient <address> --execute");
  const contract = dropsAddress();
  if (!contract) throw new Error("NEXT_PUBLIC_CELO_DROPS_ADDRESS not set");
  const now = await pub.readContract({ address: contract, abi: CHALLENGE_ABI, functionName: "feeRecipient", authorizationList: undefined });
  console.log(`fee recipient ${now} -> ${to}`);
  if (!execute) return console.log("dry run: pass --execute");
  const tx = await sendDropsTx(encodeFunctionData({ abi: CHALLENGE_ABI, functionName: "setFeeRecipient", args: [to as Address] }));
  const r = await pub.waitForTransactionReceipt({ hash: tx, timeout: 90_000 });
  if (r.status !== "success") throw new Error(`setFeeRecipient reverted: ${tx}`);
  console.log(`fee recipient set: ${tx}`);
}

/** Put the entry terms onchain: token, fee, split and window. Token, fee and split are final. */
async function register(id: string) {
  const c = await load(id);
  const opens = BigInt(Math.floor(c.opensAt.getTime() / 1000));
  const closes = BigInt(Math.floor(c.entryClosesAt.getTime() / 1000));
  console.log(
    `register ${c.id} key ${challengeKey(c.id)} token ${c.token} entry ${c.entryAmount} pool ${c.poolBps} bps window ${opens}-${closes}`,
  );
  if (!execute) return console.log("dry run: pass --execute");
  const tx = await sendDropsTx(
    encodeFunctionData({
      abi: CHALLENGE_ABI,
      functionName: "setChallenge",
      args: [challengeKey(c.id), c.token as Address, BigInt(c.entryAmount), opens, closes, c.poolBps],
    }),
  );
  const r = await pub.waitForTransactionReceipt({ hash: tx, timeout: 90_000 });
  if (r.status !== "success") throw new Error(`setChallenge reverted: ${tx}`);
  console.log(`registered: ${tx}`);
}

async function list() {
  for (const c of await db.select().from(challenges).orderBy(desc(challenges.createdAt))) {
    const { entrants, total } = await entriesTotal(db, c.id);
    const sym = dropTokenByAddress(c.token) ?? c.token;
    console.log(
      `${c.id} ${c.status} entrants ${entrants} entries ${total} pool ${challengePool(c, total)} ${sym} winners ${c.winners} closes ${c.closesAt.toISOString()} draw block ${c.drawBlock}`,
    );
  }
}

async function load(id: string) {
  const [c] = await db.select().from(challenges).where(eq(challenges.id, id));
  if (!c) throw new Error("challenge not found");
  return c;
}

async function sync(id: string) {
  const c = await load(id);
  const deposit = challengeDepositAddress();
  if (!deposit) throw new Error("NEXT_PUBLIC_CELO_DROPS_ADDRESS not set");
  const from = flag("--from-block") ? BigInt(flag("--from-block")!) : await blockAtTime(c.opensAt);
  const now = new Date();
  const to = now > c.entryClosesAt ? await blockAtTime(c.entryClosesAt) : await pub.getBlockNumber();
  console.log(`scan blocks ${from} to ${to}`);
  if (!execute) return console.log("dry run: pass --execute");
  console.log(JSON.stringify(await syncEntries(db, c, deposit, from, to)));
}

async function draw(id: string) {
  const c = await load(id);
  if (c.status !== "open") throw new Error(`status is ${c.status}`);
  if (new Date() < c.closesAt) throw new Error("the challenge has not closed yet");
  const latest = await pub.getBlockNumber();
  if (latest < BigInt(c.drawBlock)) throw new Error(`draw block ${c.drawBlock} not mined yet (now ${latest})`);
  const deposit = challengeDepositAddress();
  if (!deposit) throw new Error("NEXT_PUBLIC_CELO_DROPS_ADDRESS not set");

  // Late registrations first, so nobody who paid in time is left out.
  if (execute) {
    const from = await blockAtTime(c.opensAt);
    const to = await blockAtTime(c.entryClosesAt);
    console.log("sync", JSON.stringify(await syncEntries(db, c, deposit, from, to)));
  }
  const closeBlock = await blockAtTime(c.closesAt);
  const seed = (await pub.getBlock({ blockNumber: BigInt(c.drawBlock) })).hash as Hex;
  const entries = await db.select().from(challengeEntries).where(eq(challengeEntries.challengeId, c.id));

  const qualified: string[] = [];
  const detail: Array<{ player: string; held: number[] }> = [];
  // One ticket per player: linked wallets that each entered count once.
  const seenPlayers = new Set<string>();
  for (const e of entries) {
    // Holding the badge is what counts, whenever it was minted.
    const wallets = (await addressesForPlayer(e.player)) as Address[];
    const person = [e.player, ...wallets].map((w) => w.toLowerCase()).sort()[0];
    if (seenPlayers.has(person)) {
      detail.push({ player: e.player, held: [] });
      continue;
    }
    seenPlayers.add(person);
    const owned = new Set<number>();
    for (const w of wallets) for (const b of await onchainBadgeIdsHeld(w)) owned.add(b);
    const held = c.badgeIds.filter((b) => owned.has(b));
    detail.push({ player: e.player, held });
    if (held.length === c.badgeIds.length) qualified.push(e.player);
  }
  const { total } = await entriesTotal(db, c.id);
  const pool = challengePool(c, total);
  const winners = drawWinners(qualified, seed, c.id, c.winners);
  const perWinner = prizePerWinner(pool, winners.length);
  const result = {
    closeBlock: closeBlock.toString(),
    drawBlock: c.drawBlock,
    seed,
    entrants: entries.length,
    qualified,
    winners,
    pool: pool.toString(),
    perWinner: perWinner.toString(),
    detail,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!execute) return console.log("dry run: pass --execute");
  await db
    .update(challenges)
    .set({ status: winners.length > 0 ? "closed" : "rolled", result })
    .where(eq(challenges.id, c.id));
  console.log(winners.length > 0 ? "drawn" : "no qualifier: rolled; pass the pool to the next one with --carry");
}

async function payout(id: string) {
  const c = await load(id);
  if (c.status !== "closed") throw new Error(`status is ${c.status}, expected closed`);
  const result = c.result as { winners: string[]; perWinner: string };
  const winners = result.winners;
  const amount = BigInt(result.perWinner);
  if (winners.length === 0 || amount <= 0n) throw new Error("nothing to pay");
  const dropId = randomUUID();
  const commitment = keccak256(toBytes(`challenge:${c.id}`));
  const contract = dropsAddress();
  if (!contract) throw new Error("NEXT_PUBLIC_CELO_DROPS_ADDRESS not set");
  const total = amount * BigInt(winners.length);
  const free = (await pub.readContract({
    address: contract,
    abi: DROPS_READ_ABI,
    functionName: "freeBalance",
    args: [c.token as Address],
    authorizationList: undefined,
  })) as bigint;
  const shortfall = total > free ? total - free : 0n;
  console.log(`payout ${c.id}: ${winners.length} x ${amount} to ${winners.join(", ")}`);
  console.log(`contract free ${free}, needs ${total}, top-up from deposit wallet ${shortfall}`);
  if (!execute) return console.log("dry run: pass --execute");
  if (shortfall > 0n) {
    const topUp = await sendRelayerTokenTransfer(c.token as Address, contract, shortfall);
    const r = await pub.waitForTransactionReceipt({ hash: topUp, timeout: 90_000 });
    if (r.status !== "success") throw new Error(`top-up reverted: ${topUp}`);
    console.log(`topped up ${shortfall}: ${topUp}`);
  }
  const tx = await sendDropsTx(
    encodeFunctionData({
      abi: DROPS_ABI,
      functionName: "createDrop",
      args: [dropIdToUint(dropId), c.token as Address, amount, BigInt(winners.length), commitment],
    }),
  );
  const receipt = await pub.waitForTransactionReceipt({ hash: tx, timeout: 90_000 });
  if (receipt.status !== "success") throw new Error(`createDrop reverted: ${tx}`);
  const now = new Date();
  // Not a map treasure: status found keeps it out of detection, hints and heat.
  await db.insert(drops).values({
    id: dropId,
    h3: `challenge:${c.id}`,
    hintH3: `challenge:${c.id}`,
    label: `🏆 ${c.titleEn}`,
    token: c.token,
    amount: amount.toString(),
    maxWinners: winners.length,
    startsAt: c.closesAt,
    endsAt: new Date(now.getTime() + 90 * 86_400_000),
    salt: "0x",
    commitment,
    status: "found",
    sponsor: "challenge",
    batch: c.id,
    createTx: tx,
  });
  await db.insert(dropFinds).values(
    winners.map((player) => ({
      dropId,
      player,
      runId: randomUUID(),
      firstNearAt: now,
      lastNearAt: now,
      review: "ok",
      reviewReason: `challenge:${c.id}`,
      foundAt: now,
    })),
  );
  await db.update(challenges).set({ status: "paid", dropId }).where(eq(challenges.id, c.id));
  console.log(`paid: drop ${dropId}, tx ${tx}. Winners claim from their profile.`);
}

async function main() {
  switch (cmd) {
    case "create":
      return create();
    case "list":
      return list();
    case "register":
      return register(arg);
    case "fee-recipient":
      return setFeeRecipient(arg);
    case "sync":
      return sync(arg);
    case "draw":
      return draw(arg);
    case "payout":
      return payout(arg);
    default:
      console.log("usage: create ... | list | sync <id> | draw <id> | payout <id>  [--execute]");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
