import { createPublicClient, createWalletClient, custom, http } from "viem";
import type { Address } from "viem";
import { celo } from "./chains";
import { createLogger } from "./logger";

const log = createLogger("wallet:minipay");

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
  const result =
    typeof window !== "undefined" && window.ethereum?.isMiniPay === true;
  log.debug("isMiniPay check", { result });
  return result;
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
  log.info("connecting via MiniPay");
  const client = getWalletClient();
  if (!client) {
    log.warn("no wallet client available");
    return null;
  }
  try {
    const [address] = await client.requestAddresses();
    log.info("connected", { address: address ?? null });
    return address ?? null;
  } catch (err: unknown) {
    log.error("requestAddresses failed", err);
    throw err;
  }
}
