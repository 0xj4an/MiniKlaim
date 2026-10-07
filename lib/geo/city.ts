import { cellToLatLng } from "h3-js";
import countries from "i18n-iso-countries";
import { createLogger } from "@/lib/logger";

const log = createLogger("geo:city");

type City = {
  cityId: number;
  name: string;
  country: string;
  lat: number;
  lon: number;
  population: number;
};

let citiesCache: City[] | null = null;
let citiesByCountry: Map<string, City[]> | null = null;

function loadCities(): City[] {
  if (citiesCache) return citiesCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    citiesCache = require("all-the-cities") as City[];
    return citiesCache;
  } catch (e) {
    log.error("failed to load cities database", {
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

function getCitiesByCountry(): Map<string, City[]> {
  if (citiesByCountry) return citiesByCountry;
  
  const cities = loadCities();
  citiesByCountry = new Map();
  
  for (const city of cities) {
    const iso2 = city.country;
    if (!citiesByCountry.has(iso2)) {
      citiesByCountry.set(iso2, []);
    }
    citiesByCountry.get(iso2)!.push(city);
  }
  
  return citiesByCountry;
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function iso3ToIso2(iso3: string): string | null {
  try {
    return countries.alpha3ToAlpha2(iso3) ?? null;
  } catch {
    return null;
  }
}

/**
 * City name for an H3 cell's centroid, or null when it cannot be resolved
 * (e.g. open ocean, remote areas, or resolution failure).
 * 
 * Uses offline database of 138k+ cities worldwide. Returns the nearest city
 * within 50km radius. Prefers larger cities when multiple are equidistant.
 * 
 * Accepts optional country ISO3 (alpha-3) code for faster lookup - converts
 * to ISO2 internally and filters to ~1k cities per country instead of
 * searching all 138k.
 */
export function cityForHex(h3Id: string, countryIso3?: string): string | null {
  try {
    const [lat, lng] = cellToLatLng(h3Id);
    
    let citiesToSearch: City[];
    if (countryIso3) {
      const countryIso2 = iso3ToIso2(countryIso3);
      if (!countryIso2) {
        log.debug("could not convert ISO3 to ISO2", { countryIso3 });
        return null;
      }
      const countryMap = getCitiesByCountry();
      citiesToSearch = countryMap.get(countryIso2) ?? [];
      if (citiesToSearch.length === 0) {
        log.debug("no cities found for country", { countryIso2, countryIso3 });
        return null;
      }
    } else {
      citiesToSearch = loadCities();
      if (citiesToSearch.length === 0) {
        log.warn("cities database not loaded");
        return null;
      }
    }

    let closestCity: City | null = null;
    let minDistance = Infinity;
    const MAX_DISTANCE_KM = 50;

    for (const city of citiesToSearch) {
      const distance = haversineDistance(lat, lng, city.lat, city.lon);
      
      if (distance > MAX_DISTANCE_KM) continue;
      
      if (distance < minDistance || 
          (distance === minDistance && city.population > (closestCity?.population ?? 0))) {
        minDistance = distance;
        closestCity = city;
      }
    }

    return closestCity?.name ?? null;
  } catch (e) {
    log.warn("city resolution failed", {
      h3Id,
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
