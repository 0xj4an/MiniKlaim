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
