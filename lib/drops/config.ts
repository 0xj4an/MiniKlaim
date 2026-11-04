import type { Address } from "viem";
import type { MoveMode } from "@/lib/runs/moveMode";

/**
 * Hidden treasures. Celo mainnet only: the MiniKlaimDrops proxy address comes
 * from NEXT_PUBLIC_CELO_DROPS_ADDRESS. The feature is on when
 * NEXT_PUBLIC_TREASURES=on; the server reads it per request, the client has
 * it inlined at build, same as NEXT_PUBLIC_HEX_STRENGTH.
 */
export function isTreasuresEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TREASURES === "on";
}

const ZERO = "0x0000000000000000000000000000000000000000";

export function dropsAddress(): Address | null {
  const v = (process.env.NEXT_PUBLIC_CELO_DROPS_ADDRESS ?? "").trim();
  return v.length === 42 && v.startsWith("0x") && v !== ZERO ? (v as Address) : null;
}

/** Tokens a drop can pay in. Must match the contract allowlist. */
export const DROP_TOKENS = {
  USDT: { address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as Address, decimals: 6 },
  COPm: { address: "0x8A567e2aE79CA692Bd748aB832081C45de4041eA" as Address, decimals: 18 },
} as const;

export type DropTokenSymbol = keyof typeof DROP_TOKENS;

export function dropTokenByAddress(address: string): DropTokenSymbol | null {
  const lower = address.toLowerCase();
  for (const [sym, t] of Object.entries(DROP_TOKENS)) {
    if (t.address.toLowerCase() === lower) return sym as DropTokenSymbol;
  }
  return null;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Anti-cheat dials for a find (spec section 6). */
export function dropRules() {
  return {
    /** GPS accuracy at the drop block, metres or better. */
    maxAccuracyM: intFromEnv("DROP_MAX_ACCURACY_M", 20),
    /** Time between the first and last batch near the drop. */
    minDwellSeconds: intFromEnv("DROP_MIN_DWELL_S", 10),
    /** Batches near the drop (block or ring-1 neighbours). */
    minNearBatches: intFromEnv("DROP_MIN_NEAR_BATCHES", 2),
    /** A find this soon after publishing goes to review. */
    earlyFindMinutes: intFromEnv("DROP_EARLY_FIND_MIN", 10),
  };
}

/** Declared modes that can win a treasure. Undeclared runs go to review. */
export const DROP_ELIGIBLE_MODES: ReadonlySet<MoveMode> = new Set<MoveMode>(["foot", "bike"]);

/** How long a claim voucher stays valid. */
export const DROP_VOUCHER_TTL_SECONDS = 60 * 60;
