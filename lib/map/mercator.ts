/**
 * Web Mercator, enough of it to draw the grid without a GPU.
 *
 * The same projection MapLibre uses, so a hex drawn here sits where the same
 * hex sits on the WebGL map at the same centre and zoom. That matters more
 * than it sounds: the grid tier is the fallback for the phones nobody on the
 * team owns, so the only way to check it is to open it on a normal phone with
 * `?maptier=grid` and compare. If the projections disagreed, every such
 * comparison would be useless.
 *
 * No tiles and no GPU, so there is nothing here but arithmetic.
 */

export type LngLat = [number, number];
export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

/** Mercator diverges at the poles; this is the latitude MapLibre clamps to. */
export const MAX_LATITUDE = 85.051129;

/** Pixels across the whole world at a zoom level, matching MapLibre's 512px tiles. */
export function worldSize(zoom: number): number {
  return 512 * Math.pow(2, zoom);
}

export function clampLatitude(lat: number): number {
  return Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, lat));
}

/** A position in world pixels, origin at the top left of the world. */
export function toWorld([lng, lat]: LngLat, zoom: number): Point {
  const size = worldSize(zoom);
  const x = ((lng + 180) / 360) * size;
  const phi = (clampLatitude(lat) * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * size;
  return { x, y };
}

/**
 * A position in canvas pixels, for a view of `size` centred on `center`.
 * Values outside the canvas are returned as they are: clipping is the
 * canvas's job, and a hex half off the edge still has to be drawn.
 */
export function project(
  lngLat: LngLat,
  center: LngLat,
  zoom: number,
  size: Size,
): Point {
  const p = toWorld(lngLat, zoom);
  const c = toWorld(center, zoom);
  return {
    x: p.x - c.x + size.width / 2,
    y: p.y - c.y + size.height / 2,
  };
}

/** Metres per pixel at a latitude and zoom, for the scale bar and hit tests. */
export function metersPerPixel(lat: number, zoom: number): number {
  const earthCircumference = 40075016.686;
  return (
    (earthCircumference * Math.cos((clampLatitude(lat) * Math.PI) / 180)) /
    worldSize(zoom)
  );
}

/**
 * The zoom at which `spanMeters` across fits in `size`, capped to the range
 * the grid is legible in. Used to frame a run without a camera to animate.
 */
export function zoomForSpan(
  spanMeters: number,
  lat: number,
  size: Size,
  bounds: { min: number; max: number } = { min: 2, max: 17 },
): number {
  const shorter = Math.max(1, Math.min(size.width, size.height));
  if (!(spanMeters > 0)) return bounds.max;
  // metersPerPixel is linear in 1/worldSize, so solve for the zoom directly
  // rather than stepping zoom levels until one fits.
  const earthCircumference = 40075016.686;
  const wanted =
    (earthCircumference * Math.cos((clampLatitude(lat) * Math.PI) / 180) * shorter) /
    (spanMeters * 512);
  const zoom = Math.log2(wanted);
  return Math.min(bounds.max, Math.max(bounds.min, zoom));
}
