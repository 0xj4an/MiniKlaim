import { cellToBoundary, cellToParent, getResolution, isValidCell } from "h3-js";

/**
 * The outline of a run for its share card: the blocks it captured as one SVG
 * path, scaled to fit a box. It is the shape only, with no streets and no
 * coordinates, so the card shows what the run looked like without drawing a
 * map of where the player lives.
 */

/** Cells drawn at most. A long drive is drawn in coarser cells instead. */
export const SHAPE_MAX_CELLS = 600;
const COARSEST_RESOLUTION = 4;

/** Coarsen the cells one H3 level at a time until few enough are left. */
export function cellsForShape(h3Ids: string[], max = SHAPE_MAX_CELLS): string[] {
  let cells = [...new Set(h3Ids.filter((id) => isValidCell(id)))];
  while (cells.length > max) {
    const res = getResolution(cells[0]);
    if (res <= COARSEST_RESOLUTION) break;
    cells = [...new Set(cells.map((c) => cellToParent(c, res - 1)))];
  }
  return cells;
}

/**
 * SVG path data for the run's cells inside a `width` x `height` box, or null
 * when there is nothing to draw.
 */
export function runShapePath(
  h3Ids: string[],
  box: { width: number; height: number; padding?: number },
): string | null {
  const cells = cellsForShape(h3Ids);
  if (cells.length === 0) return null;

  const rings = cells.map((c) => cellToBoundary(c));
  const refLng = rings[0][0][1];
  // Keep a run that crosses the antimeridian in one piece.
  const unwrap = (lng: number) =>
    lng - refLng > 180 ? lng - 360 : lng - refLng < -180 ? lng + 360 : lng;
  let latSum = 0;
  let n = 0;
  for (const ring of rings) {
    for (const [lat] of ring) {
      latSum += lat;
      n += 1;
    }
  }
  const squash = Math.cos(((latSum / n) * Math.PI) / 180);
  const points = rings.map((ring) =>
    ring.map(([lat, lng]) => [unwrap(lng) * squash, -lat] as const),
  );

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of points) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const pad = box.padding ?? 0;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(
    (box.width - 2 * pad) / spanX,
    (box.height - 2 * pad) / spanY,
  );
  const offX = (box.width - spanX * scale) / 2;
  const offY = (box.height - spanY * scale) / 2;
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

  return points
    .map(
      (ring) =>
        `M${ring
          .map(
            ([x, y]) =>
              `${fmt(offX + (x - minX) * scale)} ${fmt(offY + (y - minY) * scale)}`,
          )
          .join("L")}Z`,
    )
    .join("");
}
