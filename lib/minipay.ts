import { createPublicClient, createWalletClient, custom, http } from "viem";
import type { Address } from "viem";
import { celo } from "./chains";

type MiniPayProvider = {
  isMiniPay?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: MiniPayProvider;
  }
}

export function isMiniPay(): boolean {
  return typeof window !== "undefined" && window.ethereum?.isMiniPay === true;
}

export function getPublicClient() {
  return createPublicClient({
    chain: celo,
    transport: http(),
  });
}

export function getWalletClient() {
  if (typeof window === "undefined" || !window.ethereum) return null;
  return createWalletClient({
    chain: celo,
    transport: custom(window.ethereum),
  });
}

export async function connectMiniPay(): Promise<Address | null> {
  const client = getWalletClient();
  if (!client) return null;
  const [address] = await client.requestAddresses();
  return address ?? null;
}
