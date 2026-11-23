import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { dropFinds, drops } from "@/lib/db/schema";
import { DROP_VOUCHER_TTL_SECONDS, dropsAddress } from "@/lib/drops/config";
import { dropIdToUint } from "@/lib/drops/ids";
import { createLogger } from "@/lib/logger";
import { withAttribution } from "@/lib/onchain/attribution";
import { sendExclusive } from "@/lib/onchain/relayerQueue";
import { getSignerKey, isSignerConfigured } from "@/lib/onchain/signer";

const log = createLogger("drops:claim");

type Db = PgDatabase<PgQueryResultHKT, Record<string, never>>;

export const DROPS_ABI = parseAbi([
  "function claimDropsFor(address player, uint256[] dropIds, uint256 nonce, uint256 deadline, bytes sig) returns (uint256)",
  "function createDrop(uint256 dropId, address token, uint256 amount, uint256 maxWinners, bytes32 commitment)",
  "function updateDrop(uint256 dropId, uint256 amount, uint256 maxWinners)",
  "function expireDrop(uint256 dropId)",
  "function reveal(uint256 dropId, uint64 h3, bytes32 salt)",
]);

export const DROPS_READ_ABI = parseAbi([
  "function isClaimed(uint256 dropId) view returns (bool)",
  "function freeBalance(address token) view returns (uint256)",
  "function committed(address token) view returns (uint256)",
]);

const CLAIM_DROPS_TYPES = {
  ClaimDrops: [
    { name: "player", type: "address" },
    { name: "dropIds", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** A claim already sent and not yet confirmed is not sent again for this long. */
const CLAIM_RETRY_MS = 10 * 60_000;

export function dropsPublicClient() {
  return createPublicClient({ chain: celo as Chain, transport: http() });
}

function relayerWallet() {
  return createWalletClient({
    account: privateKeyToAccount(getSignerKey()),
    chain: celo,
    transport: http(),
  });
}

export function isDropsConfigured(): boolean {
  return isSignerConfigured() && dropsAddress() !== null;
}

/** Fresh random single-use nonce. */
export function newNonce(): bigint {
  return BigInt(`0x${randomBytes(32).toString("hex")}`);
}

export async function signClaimVoucher(params: {
  contract: Address;
  player: Address;
  dropIds: bigint[];
  nonce: bigint;
  deadline: bigint;
}): Promise<Hex> {
  const account = privateKeyToAccount(getSignerKey());
  return account.signTypedData({
    domain: { name: "MiniKlaimDrops", version: "1", chainId: celo.id, verifyingContract: params.contract },
    types: CLAIM_DROPS_TYPES,
    primaryType: "ClaimDrops",
    message: {
      player: params.player,
      dropIds: params.dropIds,
      nonce: params.nonce,
      deadline: params.deadline,
    },
  });
}

/** Send a relayer tx to MiniKlaimDrops, tagged, through the shared nonce queue. */
export async function sendDropsTx(data: Hex): Promise<Hex> {
  const contract = dropsAddress();
  if (!contract) throw new Error("drops contract not configured");
  const wallet = relayerWallet();
  return sendExclusive(() =>
    wallet.sendTransaction({
      to: contract,
      data: withAttribution(data),
      chain: celo,
      account: wallet.account,
      kzg: undefined,
    }),
  );
}

/**
 * Relayer pays `amount` of `token` to `to`, tagged, through the shared nonce
 * queue. Used by the challenge payout to move entries from the deposit wallet
 * into the drops contract.
 */
export async function sendRelayerTokenTransfer(token: Address, to: Address, amount: bigint): Promise<Hex> {
  const wallet = relayerWallet();
  const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
  return sendExclusive(() =>
    wallet.sendTransaction({
      to: token,
      data: withAttribution(data),
      chain: celo,
      account: wallet.account,
      kzg: undefined,
    }),
  );
}

export type ClaimResult =
  | { ok: true; txHash: Hex; count: number }
  | { ok: false; reason: "not-configured" | "nothing" | "in-flight" | "error"; error?: string };

/**
 * Reserve this wallet's won and unpaid finds for one claim. Free to take:
 * never requested, requested long enough ago to retry, or handed to the
 * player as a voucher (`nonce` set) that never became a tx. A relayer send in
 * flight (`nonce` null, requested recently) is not taken twice.
 */
async function reserveFinds(database: Db, lower: string, now: Date, nonce: bigint | null) {
  const reserved = await database
    .update(dropFinds)
    .set({ claimRequestedAt: now, nonce: nonce === null ? null : nonce.toString() })
    .where(
      and(
        eq(dropFinds.player, lower),
        eq(dropFinds.review, "ok"),
        isNull(dropFinds.claimedAt),
        isNull(dropFinds.claimTx),
        or(
          isNull(dropFinds.claimRequestedAt),
          lt(dropFinds.claimRequestedAt, new Date(now.getTime() - CLAIM_RETRY_MS)),
          isNotNull(dropFinds.nonce),
        ),
      ),
    )
    .returning({ id: dropFinds.id, dropId: dropFinds.dropId });

  if (reserved.length === 0) {
    const [pending] = await database
      .select({ id: dropFinds.id })
      .from(dropFinds)
      .where(and(eq(dropFinds.player, lower), eq(dropFinds.review, "ok"), isNull(dropFinds.claimedAt)))
      .limit(1);
    return { reserved, reason: pending ? ("in-flight" as const) : ("nothing" as const) };
  }
  return { reserved, reason: null };
}

export type ClaimVoucher = {
  contract: Address;
  dropIds: string[];
  nonce: string;
  deadline: string;
  signature: Hex;
};

/**
 * The player pays the fee: reserve the finds and hand back a signed voucher
 * for `claimDropsFor`. The player's tx is then recorded with
 * `recordPlayerClaimTx`. A voucher that never becomes a tx can be taken over
 * by the relayer, and the contract pays each drop to a player only once.
 */
export async function claimVoucherForPlayer(
  database: Db,
  player: string,
  now = new Date(),
): Promise<{ ok: true; voucher: ClaimVoucher } | { ok: false; reason: "not-configured" | "nothing" | "in-flight" }> {
  const contract = dropsAddress();
  if (!contract || !isSignerConfigured()) return { ok: false, reason: "not-configured" };
  const lower = player.toLowerCase();
  const nonce = newNonce();
  const { reserved, reason } = await reserveFinds(database, lower, now, nonce);
  if (reason) return { ok: false, reason };
  const ids = reserved.map((r) => dropIdToUint(r.dropId));
  const deadline = BigInt(Math.floor(now.getTime() / 1000) + DROP_VOUCHER_TTL_SECONDS);
  const signature = await signClaimVoucher({ contract, player: lower as Address, dropIds: ids, nonce, deadline });
  return {
    ok: true,
    voucher: {
      contract,
      dropIds: ids.map(String),
      nonce: nonce.toString(),
      deadline: deadline.toString(),
      signature,
    },
  };
}

/**
 * The player sent the voucher's tx: record it so the receipt settles the finds.
 * The tx must exist and go from the player to the drops contract, so a made-up
 * hash cannot park someone's prize on a tx that never settles.
 */
export async function recordPlayerClaimTx(
  database: Db,
  player: string,
  nonce: string,
  txHash: Hex,
): Promise<number> {
  const contract = dropsAddress();
  if (!contract) return 0;
  const client = dropsPublicClient();
  let tx = null;
  for (let i = 0; i < 5 && !tx; i++) {
    tx = await client.getTransaction({ hash: txHash }).catch(() => null);
    if (!tx) await new Promise((r) => setTimeout(r, 1500));
  }
  if (
    !tx ||
    tx.from.toLowerCase() !== player.toLowerCase() ||
    tx.to?.toLowerCase() !== contract.toLowerCase()
  ) {
    log.warn("player claim tx rejected", { player: player.toLowerCase(), txHash, found: !!tx });
    return 0;
  }
  const rows = await database
    .update(dropFinds)
    .set({ claimTx: txHash })
    .where(
      and(
        eq(dropFinds.player, player.toLowerCase()),
        eq(dropFinds.nonce, nonce),
        isNull(dropFinds.claimTx),
        isNull(dropFinds.claimedAt),
      ),
    )
    .returning({ id: dropFinds.id });
  if (rows.length > 0) log.warn("treasure claim sent by player", { player: player.toLowerCase(), count: rows.length, txHash });
  return rows.length;
}

/**
 * Tap + relayer: the player tapped "Claim". Take this wallet's won and unpaid
 * finds, sign one voucher and let the relayer submit `claimDropsFor`. The
 * player signs nothing and pays no fee; the contract always pays `player`.
 *
 * The finds are reserved with `claim_requested_at` before sending, so two taps
 * do not send two txs. A failed send releases them.
 */
export async function claimDropsForPlayer(database: Db, player: string, now = new Date()): Promise<ClaimResult> {
  const contract = dropsAddress();
  if (!contract || !isSignerConfigured()) return { ok: false, reason: "not-configured" };
  const lower = player.toLowerCase();

  const { reserved, reason } = await reserveFinds(database, lower, now, null);
  if (reason) return { ok: false, reason };

  const ids = reserved.map((r) => dropIdToUint(r.dropId));
  const nonce = newNonce();
  const deadline = BigInt(Math.floor(now.getTime() / 1000) + DROP_VOUCHER_TTL_SECONDS);
  try {
    const sig = await signClaimVoucher({ contract, player: lower as Address, dropIds: ids, nonce, deadline });
    const data = encodeFunctionData({
      abi: DROPS_ABI,
      functionName: "claimDropsFor",
      args: [lower as Address, ids, nonce, deadline, sig],
    });
    const txHash = await sendDropsTx(data);
    await database
      .update(dropFinds)
      .set({ claimTx: txHash, nonce: nonce.toString() })
      .where(
        inArray(
          dropFinds.id,
          reserved.map((r) => r.id),
        ),
      );
    log.warn("treasure claim sent", { player: lower, count: ids.length, txHash });
    return { ok: true, txHash, count: ids.length };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await database
      .update(dropFinds)
      .set({ claimRequestedAt: null })
      .where(
        inArray(
          dropFinds.id,
          reserved.map((r) => r.id),
        ),
      );
    log.error("treasure claim failed", { player: lower, error });
    return { ok: false, reason: "error", error };
  }
}

/**
 * Settle sent claims from their receipts: success marks the finds and drops
 * claimed, a revert releases the finds so the next tap retries. Called when
 * the player's treasures are read, so no cron is needed for the pilot.
 */
export async function reconcileClaims(database: Db, player: string): Promise<void> {
  const lower = player.toLowerCase();
  const sent = await database
    .select({ id: dropFinds.id, dropId: dropFinds.dropId, claimTx: dropFinds.claimTx })
    .from(dropFinds)
    .where(and(eq(dropFinds.player, lower), isNotNull(dropFinds.claimTx), isNull(dropFinds.claimedAt)));
  if (sent.length === 0) return;
  const client = dropsPublicClient();
  const byTx = new Map<string, typeof sent>();
  for (const s of sent) {
    const list = byTx.get(s.claimTx!) ?? [];
    list.push(s);
    byTx.set(s.claimTx!, list);
  }
  for (const [tx, rows] of byTx) {
    const receipt = await client.getTransactionReceipt({ hash: tx as Hex }).catch(() => null);
    if (!receipt) continue;
    const ids = rows.map((r) => r.id);
    if (receipt.status === "success") {
      await database.update(dropFinds).set({ claimedAt: new Date() }).where(inArray(dropFinds.id, ids));
      // Claimed once every slot is paid; a drop with winners left stays open.
      await database
        .update(drops)
        .set({ status: "claimed" })
        .where(
          and(
            inArray(
              drops.id,
              rows.map((r) => r.dropId),
            ),
            sql`(select count(*) from ${dropFinds} where ${dropFinds.dropId} = ${drops.id} and ${dropFinds.claimedAt} is not null) >= ${drops.maxWinners}`,
          ),
        );
    } else {
      await database
        .update(dropFinds)
        .set({ claimTx: null, claimRequestedAt: null, nonce: null })
        .where(inArray(dropFinds.id, ids));
      log.error("treasure claim reverted", { player: lower, txHash: tx });
    }
  }
}

/** The player's won treasures, newest first, with drop details. */
export async function playerTreasures(database: Db, player: string) {
  return database
    .select({
      findId: dropFinds.id,
      dropId: dropFinds.dropId,
      label: drops.label,
      token: drops.token,
      amount: drops.amount,
      foundAt: dropFinds.foundAt,
      claimTx: dropFinds.claimTx,
      claimedAt: dropFinds.claimedAt,
    })
    .from(dropFinds)
    .innerJoin(drops, eq(drops.id, dropFinds.dropId))
    .where(and(eq(dropFinds.player, player.toLowerCase()), eq(dropFinds.review, "ok")))
    .orderBy(sql`${dropFinds.foundAt} desc`);
}
