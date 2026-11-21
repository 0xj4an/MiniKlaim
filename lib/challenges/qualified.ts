/**
 * Who, of the players that entered, holds every badge the challenge asks
 * for. One rule, used by the draw (scripts/challenges.ts) and by the count
 * the challenge card shows, so the number a player sees during the week is
 * the number the draw would use if it ran now.
 *
 * - Holding the badge is what counts, on any of the player's linked wallets,
 *   whenever it was minted.
 * - One ticket per person: linked wallets that each entered count once.
 */
export type QualifiedDeps = {
  /** Every wallet of the player that owns `address`, itself included. */
  walletsOf: (address: string) => Promise<string[]>;
  /** Badge ids `wallet` holds onchain. */
  heldOf: (wallet: string) => Promise<number[]>;
};

export type QualifiedResult = {
  qualified: string[];
  detail: Array<{ player: string; held: number[] }>;
};

export async function resolveQualified(
  entrants: readonly string[],
  badgeIds: readonly number[],
  deps: QualifiedDeps,
): Promise<QualifiedResult> {
  const qualified: string[] = [];
  const detail: QualifiedResult["detail"] = [];
  const seenPlayers = new Set<string>();
  for (const player of entrants) {
    const wallets = await deps.walletsOf(player);
    const person = [player, ...wallets].map((w) => w.toLowerCase()).sort()[0];
    if (seenPlayers.has(person)) {
      detail.push({ player, held: [] });
      continue;
    }
    seenPlayers.add(person);
    const owned = new Set<number>();
    for (const w of wallets) for (const b of await deps.heldOf(w)) owned.add(b);
    const held = badgeIds.filter((b) => owned.has(b));
    detail.push({ player, held });
    if (held.length === badgeIds.length) qualified.push(player);
  }
  return { qualified, detail };
}
