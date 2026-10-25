import type { ExpressionSpecification } from "maplibre-gl";

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

/**
 * Fill opacity by block level (hex strength): a level-1 block is faint, a
 * level-10 block is solid. `legacy` is used when the row has no level
 * (strength off, or the world list, which does not carry levels).
 */
export function strengthOpacity(
  step: number,
  floor: number,
  legacy: number,
): ExpressionSpecification {
  return [
    "case",
    [">", ["coalesce", ["get", "strength"], 0], 0],
    ["+", floor, ["*", step, ["get", "strength"]]],
    legacy,
  ];
}
