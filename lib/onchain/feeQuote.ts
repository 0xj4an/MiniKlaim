import { type Address, parseAbi } from "viem";
import { createLogger } from "@/lib/logger";
import { type ChainKey, getChain } from "@/lib/onchain/chains";
import { type FeeEstimate, feeUsd, type UsdRate } from "@/lib/onchain/feeEstimate";
import { hexesPublicClient } from "@/lib/onchain/hexes";
import {
  type Db,
  playerCanPay,
  sponsoredLast24h,
} from "@/lib/onchain/sponsor";
import { estimateClaimGas, remainingHexAllowance } from "@/lib/onchain/sponsorRules";
import { TOKENS } from "@/lib/tokens";

const log = createLogger("onchain:feeQuote");

// Same directory sponsor.ts reads: token-per-CELO rate for each fee currency.
const FEE_CURRENCY_DIRECTORY: Partial<Record<ChainKey, Address>> = {
  celo: "0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276",
};
const DIRECTORY_ABI = parseAbi([
  "function getExchangeRate(address token) view returns (uint256 numerator, uint256 denominator)",
]);

// Gas price and rate move slowly; one read a minute serves every claim screen.
const PRICE_TTL_MS = 60_000;
const priceCache = new Map<ChainKey, { gasPrice: bigint; rate: UsdRate; at: number }>();

async function prices(
  chainKey: ChainKey,
): Promise<{ gasPrice: bigint; rate: UsdRate } | null> {
  const hit = priceCache.get(chainKey);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit;
  const directory = FEE_CURRENCY_DIRECTORY[chainKey];
  if (!directory) return null;
  const client = hexesPublicClient(chainKey);
  const [gasPrice, rate] = await Promise.all([
    client.getGasPrice(),
    client.readContract({
      address: directory,
      abi: DIRECTORY_ABI,
      functionName: "getExchangeRate",
      // USDm is its own fee adapter and tracks the dollar.
      args: [TOKENS.USDm.feeAdapter],
      // Same viem typing quirk as badges.ts: undefined, never [].
      authorizationList: undefined,
    }) as Promise<readonly [bigint, bigint]>,
  ]);
  const entry = {
    gasPrice,
    rate: { numerator: rate[0], denominator: rate[1] },
    at: Date.now(),
  };
  priceCache.set(chainKey, entry);
  return entry;
}

/**
 * What saving `hexCount` hexes plus `badgeCount` badges costs the player, in
 * USD, and whether the relayer will pay instead. Read failures return
 * `usd: null` so the UI simply leaves the line out.
 */
export async function quoteClaimFee(
  db: Db,
  opts: {
    player: Address | null;
    hexCount: number;
    badgeCount: number;
    chainKey: ChainKey;
  },
): Promise<FeeEstimate> {
  const { player, hexCount, badgeCount, chainKey } = opts;
  const recorded = getChain(chainKey).hexesRecords;
  const gas = estimateClaimGas(hexCount, badgeCount, recorded);
  let usd: number | null = null;
  try {
    const p = await prices(chainKey);
    if (p) usd = feeUsd(gas, p.gasPrice, p.rate);
  } catch (e) {
    log.warn("fee quote price read failed", {
      chainKey,
      error: e instanceof Error ? e.message.slice(0, 160) : String(e),
    });
  }

  let sponsored = false;
  if (player && hexCount > 0) {
    try {
      const pay = await playerCanPay(player, hexCount, badgeCount, chainKey);
      if (!pay.canPay) {
        const allowance = remainingHexAllowance(
          await sponsoredLast24h(db, player, "hexes"),
        );
        sponsored = allowance > 0;
      }
    } catch (e) {
      log.warn("fee quote sponsor check failed", {
        chainKey,
        error: e instanceof Error ? e.message.slice(0, 160) : String(e),
      });
    }
  }
  return { usd, sponsored };
}
