import { cellToLatLng } from "h3-js";
import countries from "i18n-iso-countries";
import { createLogger } from "@/lib/logger";
import { cityName, countryRange } from "@/lib/geo/citiesBinary";
import { loadCities } from "@/lib/geo/cities-loader";

const log = createLogger("geo:city");

/** A city further than this from the block's centre is not its city. */
const MAX_DISTANCE_KM = 100;

const R_KM = 6371;
const RAD = Math.PI / 180;

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function iso3ToIso2(iso3: string): string | null {
  try {
    return countries.alpha3ToAlpha2(iso3) ?? null;
  } catch {
    return null;
  }
}

/**
 * The name of the city nearest an H3 cell's centre, within 100 km, or null.
 *
 * City is a nice-to-have on a captured block: a block with no city still
 * counts, so every failure here returns null instead of throwing.
 *
 * `countryIso3` narrows the scan to that country's cities, which is the only
 * reason this is fast enough to run per block during a claim. The table is
 * sorted by country, so that is a contiguous range and nothing is indexed at
 * runtime.
 */
export function cityForHex(h3Id: string, countryIso3?: string): string | null {
  try {
    const table = loadCities();
    if (!table || table.cityCount === 0) return null;
    const [lat, lng] = cellToLatLng(h3Id);

    let from = 0;
    let to = table.cityCount;
    if (countryIso3) {
      const iso2 = iso3ToIso2(countryIso3);
      if (!iso2) {
        log.debug("no ISO2 for country", { countryIso3 });
        return null;
      }
      const range = countryRange(table, iso2);
      if (!range) {
        log.debug("country not in the city table", { iso2, countryIso3 });
        return null;
      }
      [from, to] = range;
    }

    let best = -1;
    let bestKm = Infinity;
    for (let i = from; i < to; i++) {
      const km = haversineKm(lat, lng, table.lat[i], table.lon[i]);
      if (km > MAX_DISTANCE_KM || km >= bestKm) continue;
      bestKm = km;
      best = i;
    }
    // Ties keep the first match, and the table is ordered by population
    // within a country, so the bigger city wins — same rule as before.
    return best === -1 ? null : cityName(table, best);
  } catch (e) {
    log.error("city resolution failed", {
      h3Id,
      countryIso3,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
