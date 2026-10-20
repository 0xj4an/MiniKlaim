import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { erc20Abi, formatEther, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hexes, runs, sponsoredMints } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { type ChainKey, getChain } from "@/lib/onchain/chains";
import {
  CAPTURE_CHUNK,
  CAPTURE_CHUNK_RECORDED,
  captureBatch,
  chunkIds,
  hexesPublicClient,
} from "@/lib/onchain/hexes";
import { getSignerKey } from "@/lib/onchain/signer";
import {
  estimateClaimGas,
  feeInToken,
  feeWithBuffer,
  type MintStatus,
  playerTxMaxHexes,
  relayerLowBalanceCelo,
  remainingHexAllowance,
} from "@/lib/onchain/sponsorRules";
import { TOKENS } from "@/lib/tokens";

const log = createLogger("onchain:sponsor");

export type Db = PostgresJsDatabase<Record<string, never>>;

// Celo's FeeCurrencyDirectory: token-per-CELO rate for each fee currency.
const FEE_CURRENCY_DIRECTORY: Partial<Record<ChainKey, Address>> = {
  celo: "0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276",
};
const DIRECTORY_ABI = parseAbi([
  "function getExchangeRate(address token) view returns (uint256 numerator, uint256 denominator)",
]);

export type PayCheck = {
  canPay: boolean;
  /** CELO, or the stablecoin that covers the fee. */
  via?: string;
  feeWei: bigint;
};

/**
 * Whether the player could pay their own claim for `hexCount` hexes plus
 * `badgeCount` badges, in CELO or any one fee currency. Read failures count
 * as "cannot pay" so an RPC hiccup does not block a player who needs help;
 * the daily cap still bounds the cost.
 */
export async function playerCanPay(
  player: Address,
  hexCount: number,
  badgeCount: number,
  chainKey: ChainKey,
): Promise<PayCheck> {
  const recorded = getChain(chainKey).hexesRecords;
  const gas = estimateClaimGas(hexCount, badgeCount, recorded);
  if (hexCount > playerTxMaxHexes(recorded)) {
    // One claim tx cannot carry this many hexes.
    return { canPay: false, feeWei: 0n };
  }
  const client = hexesPublicClient(chainKey);
  try {
    const gasPrice = await client.getGasPrice();
    const feeWei = feeWithBuffer(gas, gasPrice);
    const native = await client.getBalance({ address: player });
    if (native >= feeWei) return { canPay: true, via: "CELO", feeWei };

    const directory = FEE_CURRENCY_DIRECTORY[chainKey];
    const { feeCurrencies } = getChain(chainKey);
    if (!directory || feeCurrencies.length === 0) {
      return { canPay: false, feeWei };
    }
    for (const fc of feeCurrencies) {
      const [balance, rate] = await Promise.all([
        client.readContract({
          address: fc.token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [player],
          // Same viem typing quirk as badges.ts: undefined, never [].
          authorizationList: undefined,
        }) as Promise<bigint>,
        client.readContract({
          address: directory,
          abi: DIRECTORY_ABI,
          functionName: "getExchangeRate",
          args: [fc.adapter],
          authorizationList: undefined,
        }) as Promise<readonly [bigint, bigint]>,
      ]);
      const decimals = TOKENS[fc.symbol].decimals;
      const need = feeInToken(
        feeWei,
        { numerator: rate[0], denominator: rate[1] },
        decimals,
      );
      if (need > 0n && balance >= need) {
        return { canPay: true, via: fc.symbol, feeWei };
      }
    }
    return { canPay: false, feeWei };
  } catch (e) {
    log.warn("player balance read failed; treating as cannot pay", {
      player,
      chainKey,
      error: e instanceof Error ? e.message.slice(0, 160) : String(e),
    });
    return { canPay: false, feeWei: 0n };
  }
}

export async function setMintStatus(db: Db, runId: string, status: MintStatus) {
  await db
    .update(runs)
    .set({ mintStatus: status, mintStatusAt: sql`now()` })
    .where(eq(runs.id, runId));
}

/** Hexes (or badge txs) the relayer paid for this wallet in the last 24h. */
export async function sponsoredLast24h(
  db: Db,
  address: string,
  kind: "hexes" | "badges",
): Promise<number> {
  const [row] = await db
    .select({
      total:
        kind === "hexes"
          ? sql<number>`coalesce(sum(${sponsoredMints.count}), 0)::int`
          : sql<number>`count(*)::int`,
    })
    .from(sponsoredMints)
    .where(
      and(
        eq(sponsoredMints.userAddress, address.toLowerCase()),
        eq(sponsoredMints.kind, kind),
        gt(sponsoredMints.createdAt, sql`now() - interval '24 hours'`),
      ),
    );
  return row?.total ?? 0;
}

export async function recordSponsored(
  db: Db,
  entry: {
    address: string;
    runId: string | null;
    kind: "hexes" | "badges";
    count: number;
    txHash: string;
  },
) {
  await db.insert(sponsoredMints).values({
    userAddress: entry.address.toLowerCase(),
    runId: entry.runId,
    kind: entry.kind,
    count: entry.count,
    txHash: entry.txHash,
  });
}

export type SponsorRunResult = {
  status: Extract<
    MintStatus,
    "sponsored" | "sponsor_capped" | "sponsor_failed"
  >;
  minted: number;
  left: number;
  txHash?: string;
  error?: string;
};

/**
 * Relayer-mint a run's unminted hexes, up to what is left of the wallet's
 * daily allowance. Records each tx and sets the run's mint status:
 * `sponsor_failed` when the chain or relayer let us down (the cron retries
 * those), `sponsor_capped` when the allowance ran out, `sponsored` otherwise.
 */
export async function sponsorRunHexes(
  db: Db,
  opts: {
    runId: string;
    player: Address;
    chainKey: ChainKey;
    chunkSize?: number;
  },
): Promise<SponsorRunResult> {
  const { runId, player, chainKey } = opts;
  const rows = await db
    .select({ h3Id: hexes.h3Id })
    .from(hexes)
    .where(and(eq(hexes.runId, runId), isNull(hexes.mintedAt)));
  const all = rows.map((r) => r.h3Id);
  if (all.length === 0) {
    await setMintStatus(db, runId, "sponsored");
    return { status: "sponsored", minted: 0, left: 0 };
  }

  const allowance = remainingHexAllowance(
    await sponsoredLast24h(db, player, "hexes"),
  );
  const ids = all.slice(0, allowance);
  if (ids.length === 0) {
    await setMintStatus(db, runId, "sponsor_capped");
    log.warn("sponsor cap reached", { runId, player, pending: all.length });
    return { status: "sponsor_capped", minted: 0, left: all.length };
  }

  const client = hexesPublicClient(chainKey);
  let minted = 0;
  let txHash: string | undefined;
  const chunkSize =
    opts.chunkSize ??
    (getChain(chainKey).hexesRecords ? CAPTURE_CHUNK_RECORDED : CAPTURE_CHUNK);
  for (const chunk of chunkIds(ids, chunkSize)) {
    const result = await captureBatch(player, chunk, chainKey);
    let error: string | undefined;
    if (result.ok === true) {
      const receipt = await client
        .waitForTransactionReceipt({ hash: result.txHash, timeout: 60_000 })
        .catch((e: unknown) => {
          error = e instanceof Error ? e.message : String(e);
          return null;
        });
      if (receipt?.status === "success") {
        await db
          .update(hexes)
          .set({
            mintedAt: sql`now()`,
            mintTxHash: result.txHash,
            ...(getChain(chainKey).hexesRecords ? {} : { tokenAt: sql`now()` }),
          })
          .where(inArray(hexes.h3Id, chunk));
        await recordSponsored(db, {
          address: player,
          runId,
          kind: "hexes",
          count: chunk.length,
          txHash: result.txHash,
        });
        minted += chunk.length;
        txHash = result.txHash;
        continue;
      }
      error ??= `tx ${result.txHash} reverted`;
    } else {
      error = result.error || result.reason;
    }
    await setMintStatus(db, runId, "sponsor_failed");
    log.warn("sponsor mint failed", {
      runId,
      minted,
      error: error?.slice(0, 180),
    });
    void checkRelayerBalance(chainKey);
    return {
      status: "sponsor_failed",
      minted,
      left: all.length - minted,
      txHash,
      error,
    };
  }

  const left = all.length - minted;
  const status = left > 0 ? "sponsor_capped" : "sponsored";
  await setMintStatus(db, runId, status);
  void checkRelayerBalance(chainKey);
  return { status, minted, left, txHash };
}

let lastAlertAt = 0;
const ALERT_EVERY_MS = 30 * 60_000;

/**
 * Raise an alert when the relayer runs low. Sentry picks up the message in
 * the web service (and emails it); the cron logs it at error level. At most
 * once every 30 minutes per process.
 */
export async function checkRelayerBalance(chainKey: ChainKey): Promise<void> {
  try {
    const relayer = privateKeyToAccount(getSignerKey()).address;
    const balance = await hexesPublicClient(chainKey).getBalance({
      address: relayer,
    });
    const celo = Number(formatEther(balance));
    if (celo >= relayerLowBalanceCelo()) return;
    if (Date.now() - lastAlertAt < ALERT_EVERY_MS) return;
    lastAlertAt = Date.now();
    log.error("relayer balance low", { relayer, chainKey, celo });
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureMessage("relayer balance low", {
        level: "error",
        tags: { relayer: "balance", chain: chainKey },
        extra: { relayer, celo },
        fingerprint: ["relayer-balance-low", chainKey],
      });
    } catch {
      // Sentry is not initialised outside the web service.
    }
  } catch (e) {
    log.warn("relayer balance check failed", {
      error: e instanceof Error ? e.message.slice(0, 160) : String(e),
    });
  }
}
