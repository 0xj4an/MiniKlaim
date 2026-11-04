/**
 * Badge id set arithmetic, with no I/O, so the numbers can be tested.
 *
 * The contract skips ids the wallet already owns, so a voucher for every
 * eligible badge still mints the right ones. That is why the player's own
 * voucher authorized the whole set while the sponsored path subtracted the
 * held ones first, and the two drifted apart without anything breaking.
 *
 * What it broke was the wallet drawer. On 4 Nov 2026 a player with 25 badges
 * earned 3 more, the screen offered 3, and MiniPay asked him to confirm
 * claiming 28: the count came from the voucher, not from the offer. It also
 * charged for them, at `GAS_PER_BADGE` (100,000) each: 2.8M gas instead of
 * 300k, nine times the fee to mint three badges.
 */
export function withoutHeld(
  eligible: readonly bigint[],
  held: readonly number[],
): bigint[] {
  const heldSet = new Set(held.map((id) => Number(id)));
  return eligible.filter((id) => !heldSet.has(Number(id)));
}
