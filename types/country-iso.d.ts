declare module "country-iso" {
  /** ISO 3166-1 alpha-3 country codes whose polygons contain the point. */
  export function get(lat: number, lng: number): string[];
}
