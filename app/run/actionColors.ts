/**
 * The color of each thing a pass can do, as text.
 *
 * The map and the popping numbers already agreed: a block taken from someone
 * is dark pink, a reinforce is green, an attack is black (CaptureBursts,
 * lib/map/hexColors). The counter line under the timer and the line on the
 * finished-run card did not: both printed all three in orange, which on the
 * map means "yours from before" and is none of them. On 15 Nov 2026 a run
 * read "40 stolen - 68 reinforced - 17 attacked" in one color, under a green
 * pill about captures, and the player called it inconsistent. It was.
 *
 * The same run is why the numbers are laid out as a sum. "44 blocks" next to
 * "40 stolen" reads as two totals; the 40 are inside the 44, and the
 * reinforces and attacks are in neither. So the blocks are shown as
 * "44 blocks = 40 stolen + 4 unclaimed", and the rest goes on its own line
 * under "Also".
 *
 * Text shades, not the map's fills: the fills are tuned to sit over a map at
 * half opacity, and at 12 px on white the reinforce green falls under 4.5:1.
 * These are the nearest shades that hold as small text.
 */
export const ACTION_TEXT = {
  /** A block nobody held: the red of a capture on the map. */
  free: "text-red-600",
  stolen: "text-pink-700",
  reinforced: "text-emerald-700",
  attacked: "text-zinc-900",
} as const;
