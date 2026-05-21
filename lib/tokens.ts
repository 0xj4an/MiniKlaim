import type { Address } from "viem";

export type TokenSymbol = "USDm" | "USDC" | "USDT";

export type TokenInfo = {
  symbol: TokenSymbol;
  address: Address;
  decimals: number;
  /**
   * Address to pass as `feeCurrency` when paying gas in this token.
   * For USDm this equals `address`. For USDC/USDT the adapter address
   * MUST be used; passing the token address makes the tx fail.
   * Source: celopedia minipay-guide.md, Supported Stablecoins table.
   */
  feeAdapter: Address;
};

export const TOKENS: Record<TokenSymbol, TokenInfo> = {
  USDm: {
    symbol: "USDm",
    address: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
    decimals: 18,
    feeAdapter: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
  },
  USDC: {
    symbol: "USDC",
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    feeAdapter: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
  },
  USDT: {
    symbol: "USDT",
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    feeAdapter: "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72",
  },
};

export const SEASON_PASS_TOKEN: TokenInfo = TOKENS.USDT;
