import { metersPerPixel, type LngLat, type Size } from "@/lib/map/mercator";

/**
 * What the claimed-block fetch needs to know about the view, with no MapLibre
 * in it.
 *
 * That fetch asked the map for its centre and bounds, so it returned early
 * when there was no map, which is exactly the case on the grid tier. Phrasing
 * the view as data lets both tiers use the same fetch instead of the grid
 * getting a second, divergent one.
 */
export type Viewport = {
  centerLat: number;
  centerLng: number;
  /** Centre to the furthest corner, which is what the disk query takes. */
  radiusM: number;
  bounds: { west: number; south: number; east: number; north: number };
};

/**
 * The viewport a canvas of `size` shows at `center` and `zoom`.
 *
 * Latitude is derived from the pixel scale at the centre rather than
 * integrated properly up the meridian. Over a phone screen at run zoom the
 * difference is metres, and the result only has to bound a fetch.
 */
export function viewportFromCenter(
  center: LngLat,
  zoom: number,
  size: Size,
): Viewport {
  const [centerLng, centerLat] = center;
  const mpp = metersPerPixel(centerLat, zoom);
  const halfWidthM = (size.width / 2) * mpp;
  const halfHeightM = (size.height / 2) * mpp;

  const metersPerDegreeLat = 111320;
  const cos = Math.cos((centerLat * Math.PI) / 180);
  // A view centred near a pole would divide by ~0 and produce a span wider
  // than the world; clamping the cosine keeps the bounds finite.
  const metersPerDegreeLng = metersPerDegreeLat * Math.max(0.01, Math.abs(cos));

  const dLat = halfHeightM / metersPerDegreeLat;
  const dLng = halfWidthM / metersPerDegreeLng;

  return {
    centerLat,
    centerLng,
    radiusM: Math.sqrt(halfWidthM * halfWidthM + halfHeightM * halfHeightM),
    bounds: {
      west: centerLng - dLng,
      south: centerLat - dLat,
      east: centerLng + dLng,
      north: centerLat + dLat,
    },
  };
}
