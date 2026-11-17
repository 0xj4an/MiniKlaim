import {
  cellToBoundary,
  cellToLatLng,
  cellToParent,
  getResolution,
  gridDisk,
  isValidCell,
} from "h3-js";

/**
 * The drawing of a run for its share card: the blocks it captured, the empty
 * blocks around them, and where it started and ended, all scaled to fit a
 * box. It is the shape only, with no streets and no coordinates, so the card
 * shows what the run looked like without drawing a map of where the player
 * lives.
 */

/** Cells drawn at most. A long drive is drawn in coarser cells instead. */
export const SHAPE_MAX_CELLS = 600;
/** Empty neighbor cells drawn at most, so the picture stays quick to render. */
const GRID_MAX_CELLS = 1800;
const COARSEST_RESOLUTION = 4;
/** The widest a single block is drawn, corner to corner. */
const MAX_CELL_PX = 84;

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

export type RunShape = {
  /** SVG path of the run's blocks. */
  cells: string;
  /** SVG path of the empty blocks around them, for the map look. */
  grid: string;
  /** Where the run started and ended, in box pixels. Null for one block. */
  start: [number, number] | null;
  end: [number, number] | null;
  /** Roughly how wide one drawn block is, in pixels. */
  cellPx: number;
};

/**
 * Everything the card draws for a run, inside a `width` x `height` box, or
 * null when there is nothing to draw. `h3Ids` in the order they were
 * captured gives the start and end their meaning.
 */
export function runShape(
  h3Ids: string[],
  box: { width: number; height: number; padding?: number },
): RunShape | null {
  const valid = h3Ids.filter((id) => isValidCell(id));
  const cells = cellsForShape(valid);
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
  const flat = (lat: number, lng: number) => [unwrap(lng) * squash, -lat] as const;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [lat, lng] of ring) {
      const [x, y] = flat(lat, lng);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const pad = box.padding ?? 0;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  // One block, or two, would otherwise fill the whole box: a block is never
  // drawn wider than MAX_CELL_PX, and the empty blocks around it fill the rest.
  const [fx0, fy0] = flat(rings[0][0][0], rings[0][0][1]);
  const [fx3, fy3] = flat(rings[0][3][0], rings[0][3][1]);
  const cellFlat = Math.hypot(fx0 - fx3, fy0 - fy3) || 1;
  const scale = Math.min(
    (box.width - 2 * pad) / spanX,
    (box.height - 2 * pad) / spanY,
    MAX_CELL_PX / cellFlat,
  );
  const offX = (box.width - spanX * scale) / 2;
  const offY = (box.height - spanY * scale) / 2;
  const px = (lat: number, lng: number): [number, number] => {
    const [x, y] = flat(lat, lng);
    return [offX + (x - minX) * scale, offY + (y - minY) * scale];
  };
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
  const ringPath = (ring: number[][]) =>
    `M${ring
      .map(([lat, lng]) => {
        const [x, y] = px(lat, lng);
        return `${fmt(x)} ${fmt(y)}`;
      })
      .join("L")}Z`;

  const first = rings[0];
  const [ax, ay] = px(first[0][0], first[0][1]);
  const [bx, by] = px(first[3][0], first[3][1]);
  const cellPx = Math.hypot(ax - bx, ay - by);

  // The empty blocks around the run. Fewer rings for a longer run.
  const own = new Set(cells);
  const reach = cells.length <= 40 ? 4 : cells.length <= 150 ? 3 : cells.length <= 400 ? 2 : 1;
  let around = new Set<string>();
  for (let k = reach; k >= 1; k--) {
    around = new Set<string>();
    for (const c of cells) {
      for (const near of gridDisk(c, k)) if (!own.has(near)) around.add(near);
    }
    if (around.size <= GRID_MAX_CELLS) break;
  }
  let grid = "";
  if (around.size <= GRID_MAX_CELLS) {
    for (const c of around) {
      const ring = cellToBoundary(c);
      // Leave out what falls wholly outside the picture.
      const visible = ring.some(([lat, lng]) => {
        const [x, y] = px(lat, lng);
        return x >= 0 && x <= box.width && y >= 0 && y <= box.height;
      });
      if (visible) grid += ringPath(ring);
    }
  }

  let start: [number, number] | null = null;
  let end: [number, number] | null = null;
  if (valid.length > 1 && valid[0] !== valid[valid.length - 1]) {
    const [slat, slng] = cellToLatLng(valid[0]);
    const [elat, elng] = cellToLatLng(valid[valid.length - 1]);
    start = px(slat, slng);
    end = px(elat, elng);
  }

  return { cells: rings.map(ringPath).join(""), grid, start, end, cellPx };
}

/** The run's blocks alone, as SVG path data. Kept for callers that draw only that. */
export function runShapePath(
  h3Ids: string[],
  box: { width: number; height: number; padding?: number },
): string | null {
  return runShape(h3Ids, box)?.cells ?? null;
}
