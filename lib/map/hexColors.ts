import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";

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

/** Darkest shade at level 10 for your blocks and for other players'. */
export const LEVEL_DARK = {
  mine: "#9A3412",
  others: "#374151",
} as const;

/**
 * A block's level (hex strength) as a MapLibre expression, 1-10. Rows with
 * no level (strength off, or the world list) count as level 1, so they look
 * exactly as before levels existed.
 */
const LEVEL: ExpressionSpecification = [
  "max",
  1,
  ["coalesce", ["get", "strength"], 1],
];

/** A number that grows from `at1` (level 1) to `at10` (level 10). */
export function levelValue(at1: number, at10: number): ExpressionSpecification {
  return ["interpolate", ["linear"], LEVEL, 1, at1, 10, at10];
}

/** A color that darkens from `at1` (level 1) to `at10` (level 10). */
export function levelColor(at1: string, at10: string): ExpressionSpecification {
  return ["interpolate", ["linear"], LEVEL, 1, at1, 10, at10];
}

/** Outline width: thicker at level 10, so a fortress reads from afar. */
export function levelLineWidth(base: number, maxed: number): ExpressionSpecification {
  return ["case", [">=", LEVEL, 10], maxed, base];
}
