import { get as isoCountriesAt } from "country-iso";
import { cellToLatLng } from "h3-js";
import { createLogger } from "@/lib/logger";

const log = createLogger("geo:country");

/**
 * ISO 3166-1 alpha-3 country code for an H3 cell's centroid, or null when it
 * cannot be resolved (e.g. open ocean or a bad cell id). Offline lookup, safe
 * to call on the claim hot-path.
 */
export function countryForHex(h3Id: string): string | null {
  try {
    const [lat, lng] = cellToLatLng(h3Id);
    const codes = isoCountriesAt(lat, lng);
    return codes && codes.length > 0 ? codes[0] : null;
  } catch (e) {
    log.warn("country resolution failed", {
      h3Id,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
