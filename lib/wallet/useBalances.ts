"use client";

import { useEffect, useMemo } from "react";
import { erc20Abi, formatUnits } from "viem";
import { useReadContract } from "wagmi";
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

export function useBalances(
  address: `0x${string}` | null,
  enabled: boolean,
): UseBalances {
  const queryEnabled = enabled && !!address;
  const args = address ? ([address] as const) : undefined;

  const usdmQ = useReadContract({
    abi: erc20Abi,
    address: TOKENS.USDm.address,
    functionName: "balanceOf",
    args,
    chainId: celo.id,
    query: { enabled: queryEnabled },
  });
  const usdcQ = useReadContract({
    abi: erc20Abi,
    address: TOKENS.USDC.address,
    functionName: "balanceOf",
    args,
    chainId: celo.id,
    query: { enabled: queryEnabled },
  });
  const usdtQ = useReadContract({
    abi: erc20Abi,
    address: TOKENS.USDT.address,
    functionName: "balanceOf",
    args,
    chainId: celo.id,
    query: { enabled: queryEnabled },
  });

  const USDm = useMemo(() => buildBalance("USDm", usdmQ.data), [usdmQ.data]);
  const USDC = useMemo(() => buildBalance("USDC", usdcQ.data), [usdcQ.data]);
  const USDT = useMemo(() => buildBalance("USDT", usdtQ.data), [usdtQ.data]);

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
    if (usdmQ.error) log.error("USDm read failed", usdmQ.error);
    if (usdcQ.error) log.error("USDC read failed", usdcQ.error);
    if (usdtQ.error) log.error("USDT read failed", usdtQ.error);
  }, [usdmQ.error, usdcQ.error, usdtQ.error]);

  return {
    USDm,
    USDC,
    USDT,
    isLoading: usdmQ.isLoading || usdcQ.isLoading || usdtQ.isLoading,
    isError: usdmQ.isError || usdcQ.isError || usdtQ.isError,
  };
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
