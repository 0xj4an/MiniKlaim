"use client";

import { useEffect, useMemo } from "react";
import { erc20Abi, formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { celo } from "wagmi/chains";
import { createLogger } from "@/lib/logger";
import { TOKENS, type TokenSymbol } from "@/lib/tokens";

const log = createLogger("wallet:balances");

export type Balance = {
  symbol: TokenSymbol;
  formatted: string;
  value: bigint;
  decimals: number;
};

export type UseBalances = {
  USDm: Balance | null;
  USDC: Balance | null;
  USDT: Balance | null;
  isLoading: boolean;
  isError: boolean;
};

/**
 * Read the player's USDm, USDC, and USDT balances on Celo. Uses a single
 * `useReadContracts` (multicall under the hood) so the three balances land
 * in one RPC round-trip instead of three sequential calls. Matters on
 * mobile 3G connections (MiniPay's primary audience).
 */
export function useBalances(
  address: `0x${string}` | null,
  enabled: boolean,
): UseBalances {
  const queryEnabled = enabled && !!address;
  const args = address ? ([address] as const) : undefined;

  const q = useReadContracts({
    contracts: args
      ? [
          {
            abi: erc20Abi,
            address: TOKENS.USDm.address,
            functionName: "balanceOf",
            args,
            chainId: celo.id,
          },
          {
            abi: erc20Abi,
            address: TOKENS.USDC.address,
            functionName: "balanceOf",
            args,
            chainId: celo.id,
          },
          {
            abi: erc20Abi,
            address: TOKENS.USDT.address,
            functionName: "balanceOf",
            args,
            chainId: celo.id,
          },
        ]
      : [],
    query: { enabled: queryEnabled },
    allowFailure: true,
  });

  const USDm = useMemo(
    () => buildBalance("USDm", pick(q.data, 0)),
    [q.data],
  );
  const USDC = useMemo(
    () => buildBalance("USDC", pick(q.data, 1)),
    [q.data],
  );
  const USDT = useMemo(
    () => buildBalance("USDT", pick(q.data, 2)),
    [q.data],
  );

  useEffect(() => {
    if (USDm) log.debug("USDm balance", { formatted: USDm.formatted });
  }, [USDm]);

  useEffect(() => {
    if (USDC) log.debug("USDC balance", { formatted: USDC.formatted });
  }, [USDC]);

  useEffect(() => {
    if (USDT) log.debug("USDT balance", { formatted: USDT.formatted });
  }, [USDT]);

  useEffect(() => {
    if (q.error) log.error("balances multicall failed", q.error);
  }, [q.error]);

  return {
    USDm,
    USDC,
    USDT,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

function pick(
  data: ReadonlyArray<{ result?: unknown; status: string }> | undefined,
  idx: number,
): bigint | undefined {
  const r = data?.[idx];
  if (!r || r.status !== "success") return undefined;
  return r.result as bigint;
}

function buildBalance(
  symbol: TokenSymbol,
  raw: bigint | undefined,
): Balance | null {
  if (raw === undefined) return null;
  const decimals = TOKENS[symbol].decimals;
  return {
    symbol,
    value: raw,
    decimals,
    formatted: formatUnits(raw, decimals),
  };
}
