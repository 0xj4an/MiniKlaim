/**
 * One palette for every map so a color means the same thing everywhere.
 *   - yours: orange, the brand color
 *   - this run: red, what you are capturing or stealing right now
 *   - others: gray, territory you could take
 *   - here: a white outline on the cell under the player, no fill, so the
 *     color underneath (and whether it is already yours) stays visible
 */
export const HEX_COLORS = {
  mine: "#F97316",
  run: "#EF4444",
  others: "#9CA3AF",
  here: "#FFFFFF",
} as const;
