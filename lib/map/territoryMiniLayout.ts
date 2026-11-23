// No h3 import here on purpose: this half runs on the home screen, and h3-js
// is far too heavy to put on the first screen for a thumbnail.

/**
 * Where each cell goes in a box of the given size: plain equirectangular
 * around the middle of the cells, which at the size of a city is the map.
 * Returns the points and the radius to draw each hexagon with, so the cells
 * touch without overlapping, capped so three blocks do not fill the box.
 */
export function layoutMini(
  cells: ReadonlyArray<readonly [number, number]>,
  width: number,
  height: number,
  pad = 6,
): { points: Array<[number, number]>; radius: number } {
  if (cells.length === 0) return { points: [], radius: 0 };
  const lat0 = cells.reduce((s, c) => s + c[0], 0) / cells.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = cells.map((c) => [c[1] * k, -c[0]] as [number, number]);

  // Distance between neighbours, taken as the smallest gap any cell has to
  // another. One cell alone has no neighbour and gets the cap.
  let gap = Infinity;
  for (let i = 0; i < xy.length; i++) {
    for (let j = i + 1; j < xy.length; j++) {
      const d = Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]);
      if (d > 0 && d < gap) gap = d;
    }
  }

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of xy) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const maxRadius = 6;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // Scale so the cells and their own radius fit inside the padding.
  let scale = Number.isFinite(gap) ? (maxRadius * Math.sqrt(3)) / gap : 1;
  const fit = (span: number, size: number) =>
    span > 0 ? (size - 2 * pad - 2 * maxRadius) / span : Infinity;
  scale = Math.min(scale, fit(spanX, width), fit(spanY, height));
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  const radius = Number.isFinite(gap)
    ? Math.max(1.6, Math.min(maxRadius, (gap * scale) / Math.sqrt(3)))
    : maxRadius;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    points: xy.map(([x, y]) => [
      Math.round((width / 2 + (x - cx) * scale) * 10) / 10,
      Math.round((height / 2 + (y - cy) * scale) * 10) / 10,
    ]),
    radius: Math.round(radius * 10) / 10,
  };
}
