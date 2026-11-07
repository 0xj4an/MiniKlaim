import { type Address, decodeEventLog, encodeFunctionData, erc20Abi, type Hex, keccak256, parseAbi, toBytes } from "viem";
import type { Challenge } from "@/lib/db/schema";
import { dropsPublicClient, sendDropsTx } from "@/lib/drops/claim";

/**
 * Challenge entry by allowance (MiniKlaimDrops v2).
 *
 * MiniPay only passes calls to contracts and methods its team allowlisted, and
 * refuses unlimited approvals (code -32604, "Permission denied", before any
 * sheet). Its standard cap is $10. So the player approves the drops contract
 * once for `APPROVE_UNITS` of the token, and every entry after that is a tap:
 * the relayer calls `enterFor`, which pulls exactly the fee, once per player,
 * inside the window, and splits it onchain: `poolBps` stays in the contract
 * for the payout, the rest goes to the contract's `feeRecipient` in the same
 * transaction. The player signs one transaction in ten challenges and pays no
 * gas for the entries.
 */
export const APPROVE_UNITS = 10n;

export const CHALLENGE_ABI = parseAbi([
  "function setChallenge(bytes32 challengeId, address token, uint256 entry, uint64 opensAt, uint64 closesAt, uint16 poolBps)",
  "function setFeeRecipient(address recipient)",
  "function feeRecipient() view returns (address)",
  "function pooled(bytes32 challengeId) view returns (uint256)",
  "function enterFor(bytes32 challengeId, address player)",
  "function entered(bytes32 challengeId, address player) view returns (bool)",
  "function getChallenge(bytes32 challengeId) view returns ((address token, uint128 entry, uint64 opensAt, uint64 closesAt, uint16 poolBps))",
  "event ChallengeEntered(bytes32 indexed challengeId, address indexed player, address indexed token, uint256 amount)",
]);

/** Onchain id of a challenge: keccak256 of its text id. */
export function challengeKey(id: string): Hex {
  return keccak256(toBytes(id));
}

/** Approval the card asks for: APPROVE_UNITS whole tokens. */
export function approveAmount(decimals: number): bigint {
  return APPROVE_UNITS * 10n ** BigInt(decimals);
}

export async function readEntryFunds(token: Address, player: Address, spender: Address) {
  const client = dropsPublicClient();
  const [allowance, balance] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [player, spender], authorizationList: undefined }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [player], authorizationList: undefined }),
  ]);
  return { allowance, balance };
}

export async function isRegisteredOnchain(contract: Address, c: Challenge): Promise<boolean> {
  const got = (await dropsPublicClient().readContract({
    address: contract,
    abi: CHALLENGE_ABI,
    functionName: "getChallenge",
    args: [challengeKey(c.id)],
    authorizationList: undefined,
  })) as { token: Address; entry: bigint; poolBps: number };
  return (
    got.token.toLowerCase() === c.token.toLowerCase() &&
    got.entry === BigInt(c.entryAmount) &&
    Number(got.poolBps) === c.poolBps
  );
}

export async function enteredOnchain(contract: Address, c: Challenge, player: Address): Promise<boolean> {
  return (await dropsPublicClient().readContract({
    address: contract,
    abi: CHALLENGE_ABI,
    functionName: "entered",
    args: [challengeKey(c.id), player],
    authorizationList: undefined,
  })) as boolean;
}

/** Relayer submits `enterFor`. Throws on a revert. */
export async function sendEnterFor(c: Challenge, player: Address): Promise<Hex> {
  return sendDropsTx(
    encodeFunctionData({ abi: CHALLENGE_ABI, functionName: "enterFor", args: [challengeKey(c.id), player] }),
  );
}

/** The ChallengeEntered events of a receipt for this challenge, from the drops contract. */
export function entryEventsIn(
  logs: { address: Address; data: Hex; topics: [Hex, ...Hex[]] | [] }[],
  contract: Address,
  c: Challenge,
): { player: string; amount: bigint }[] {
  const key = challengeKey(c.id);
  const out: { player: string; amount: bigint }[] = [];
  for (const l of logs) {
    if (l.address.toLowerCase() !== contract.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: CHALLENGE_ABI, eventName: "ChallengeEntered", data: l.data, topics: l.topics });
      if (ev.args.challengeId !== key) continue;
      out.push({ player: ev.args.player.toLowerCase(), amount: ev.args.amount });
    } catch {
      // Another event of the contract.
    }
  }
  return out;
}
