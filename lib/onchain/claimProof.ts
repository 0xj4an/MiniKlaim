import { decodeFunctionData, type Address, type Hex } from "viem";
import { CLAIM_ROUTER_ABI } from "@/lib/onchain/claimRouterAbi";
import { HEXES_CLAIM_ABI } from "@/lib/onchain/hexesAbi";

/**
 * The blocks a player's own claim transaction settled, read from the
 * transaction itself, or null when it is not a successful claim by `player`
 * on one of our contracts.
 *
 * `/api/runs/:id/claimed` used to trust any 64-hex string in the body and
 * mark the whole run as settled, which took every block of anyone's run out
 * of the voucher, relayer and backlog queues without anything reaching the
 * chain. Now only blocks named in a `claimRun` (Hexes) or `claimAll` (router)
 * call that succeeded and was sent by the run's player count.
 *
 * Pure: the route does the chain reads and passes their results in.
 */
export function settledByClaimTx(args: {
  player: string;
  status: "success" | "reverted";
  from: string;
  to: string | null;
  input: Hex;
  hexesAddress: Address | null;
  routerAddress: Address | null;
}): string[] | null {
  if (args.status !== "success") return null;
  if (args.from.toLowerCase() !== args.player.toLowerCase()) return null;
  const to = args.to?.toLowerCase();
  if (!to) return null;

  let tokenIds: readonly bigint[];
  try {
    if (args.hexesAddress && to === args.hexesAddress.toLowerCase()) {
      const call = decodeFunctionData({ abi: HEXES_CLAIM_ABI, data: args.input });
      tokenIds = call.args[0];
    } else if (args.routerAddress && to === args.routerAddress.toLowerCase()) {
      const call = decodeFunctionData({ abi: CLAIM_ROUTER_ABI, data: args.input });
      tokenIds = call.args[0];
    } else {
      return null;
    }
  } catch {
    return null;
  }
  // Token id = the H3 index read as a number, the inverse of h3ToTokenId in
  // lib/onchain/hexes (not imported: that module carries the relayer code).
  return tokenIds.map((id) => id.toString(16));
}
