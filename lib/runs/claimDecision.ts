export type HexClaimAction = "new" | "own" | "take";

/**
 * What a claim should do with one hex.
 * `own` is any wallet of this player, including a previous run.
 * `take` is a hex that currently belongs to someone else.
 */
export function hexClaimAction(
  existing: { ownerAddress: string } | null | undefined,
  playerAddresses: ReadonlySet<string>,
): HexClaimAction {
  if (!existing?.ownerAddress) return "new";
  if (playerAddresses.has(existing.ownerAddress.toLowerCase())) return "own";
  return "take";
}
