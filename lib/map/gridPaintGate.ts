/**
 * Whether the grid canvas has a box worth painting into, and how big its
 * backing store should be.
 *
 * Extracted from the canvas component so the rule can be tested: it was wrong
 * in production and the symptom was a blank panel with no error anywhere. The
 * container reported 320 pixels tall and 0 wide until the panel holding it was
 * shown, and the old code clamped that to 1 pixel, painted, and reported the
 * map ready.
 */
export type PaintBox = {
  width: number;
  height: number;
  backingW: number;
  backingH: number;
};

/** Below this a box is a layout that has not happened yet, not a small map. */
export const MIN_PAINTABLE = 2;

/**
 * Filling a 3x buffer in software, on a phone with no GPU, costs real time
 * for no visible gain.
 */
export const MAX_PIXEL_RATIO = 2;

export function paintBox(
  containerW: number,
  containerH: number,
  devicePixelRatio: number,
): PaintBox | null {
  const width = Math.round(containerW || 0);
  const height = Math.round(containerH || 0);
  if (!(width >= MIN_PAINTABLE) || !(height >= MIN_PAINTABLE)) return null;

  const ratio = Math.min(
    MAX_PIXEL_RATIO,
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1,
  );
  return {
    width,
    height,
    backingW: Math.round(width * ratio),
    backingH: Math.round(height * ratio),
  };
}
