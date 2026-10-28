import { parseAbi, type Address } from "viem";
import type { ChainKey } from "@/lib/onchain/chains";
import { getChain } from "@/lib/onchain/chains";
import { hexesPublicClient } from "@/lib/onchain/hexes";
import { estimateMintTokensGas, feeInToken, feeWithBuffer } from "@/lib/onchain/sponsorRules";
import { TOKENS } from "@/lib/tokens";

/**
 * What minting a batch of blocks costs the player, so the profile can say so
 * before they tap instead of after the wallet refuses.
 *
 * The player pays this fee themselves (unlike claiming a run, where the
 * relayer steps in). It grows with the batch: a full 700 came to about $0.37
 * on 28 Oct, which is real money for the wallets this game runs on, while the
 * screen promised "a few cents". One player had $0.001 and could not mint.
 *
 * Every fee currency on Celo is a dollar stablecoin, so the amount in any of
 * them is the amount in dollars. CELO itself is not used for the quote: a
 * player holding only CELO still reads a dollar figure that is right within
 * the 30% buffer the estimate already carries.
 */

const FEE_CURRENCY_DIRECTORY: Partial<Record<ChainKey, Address>> = {
  celo: "0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276",
};
const DIRECTORY_ABI = parseAbi([
  "function getExchangeRate(address token) view returns (uint256 numerator, uint256 denominator)",
]);

export type MintQuote = {
  count: number;
  /** Dollars, rounded up to the cent. Null when the chain could not be read. */
  usd: number | null;
};

/** Dollars for `feeWei`, rounded up to the cent so we never under-promise. */
export function feeToUsd(
  feeWei: bigint,
  rate: { numerator: bigint; denominator: bigint },
  decimals: number,
): number {
  const units = feeInToken(feeWei, rate, decimals);
  if (units === 0n) return 0;
  const cents = (units * 100n + 10n ** BigInt(decimals) - 1n) / 10n ** BigInt(decimals);
  return Number(cents) / 100;
}

/**
 * Quote each batch size in one pass: the gas price and the exchange rate are
 * read once, not per batch. A read failure yields null rather than throwing,
 * because the profile must still render its button.
 */
export async function quoteMint(
  chainKey: ChainKey,
  counts: number[],
): Promise<MintQuote[]> {
  const unpriced = counts.map((count) => ({ count, usd: null }));
  const directory = FEE_CURRENCY_DIRECTORY[chainKey];
  const [feeCurrency] = getChain(chainKey).feeCurrencies;
  if (!directory || !feeCurrency) return unpriced;

  try {
    const client = hexesPublicClient(chainKey);
    const [gasPrice, rate] = await Promise.all([
      client.getGasPrice(),
      client.readContract({
        address: directory,
        abi: DIRECTORY_ABI,
        functionName: "getExchangeRate",
        args: [feeCurrency.adapter],
        authorizationList: undefined,
      }) as Promise<readonly [bigint, bigint]>,
    ]);
    const decimals = TOKENS[feeCurrency.symbol].decimals;
    return counts.map((count) => ({
      count,
      usd: feeToUsd(
        feeWithBuffer(estimateMintTokensGas(count), gasPrice),
        { numerator: rate[0], denominator: rate[1] },
        decimals,
      ),
    }));
  } catch {
    return unpriced;
  }
}
