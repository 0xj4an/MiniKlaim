import { createLogger } from "@/lib/logger";
import type { Hex } from "viem";

const log = createLogger("onchain:signer");

let _signerPk: Hex | null = null;
let _validated = false;

export function getSignerKey(): Hex {
  if (_validated) return _signerPk!;

  const raw = process.env.SERVER_SIGNER_PRIVATE_KEY;

  if (!raw) {
    log.error("SERVER_SIGNER_PRIVATE_KEY not set");
    throw new Error("Server signer not configured");
  }

  if (!raw.startsWith("0x") || raw.length !== 66) {
    log.error("SERVER_SIGNER_PRIVATE_KEY invalid format");
    throw new Error("Invalid server signer key format");
  }

  _signerPk = raw as Hex;
  _validated = true;
  log.info("Server signer configured");

  return _signerPk;
}

export function isSignerConfigured(): boolean {
  try {
    getSignerKey();
    return true;
  } catch {
    return false;
  }
}
