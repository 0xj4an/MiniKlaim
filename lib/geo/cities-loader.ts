/**
 * Custom loader for cities database that works in serverless environments
 * where the original all-the-cities loader fails to find cities.pbf
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PbfReader as Pbf } from "pbf";

type City = {
  cityId: number;
  name: string;
  country: string;
  lat: number;
  lon: number;
  population: number;
};

let citiesCache: City[] | null = null;
let lastLat = 0;
let lastLon = 0;

function loadCitiesFromPbf(): City[] {
  if (citiesCache) return citiesCache;

  try {
    // SIMPLIFIED: Only try the most likely paths
    // Don't block if file is missing - cities are optional enhancement
    const possiblePaths = [
      // Development
      join(process.cwd(), "node_modules", "all-the-cities", "cities.pbf"),
      // Production (if we ever get it working)
      join(process.cwd(), "public", "data", "cities.pbf"),
    ];

    let buffer: Buffer | null = null;
    let usedPath: string | null = null;

    for (const path of possiblePaths) {
      try {
        buffer = readFileSync(path);
        usedPath = path;
        console.log(`[cities-loader] Loaded cities.pbf from: ${path}`);
        break;
      } catch {
        continue;
      }
    }

    if (!buffer) {
      // Silently return empty - cities are optional
      // Don't spam logs, just work without city resolution
      return [];
    }

    const pbf = new Pbf(buffer);
    const cities: City[] = [];
    
    // Reset delta encoding state
    lastLat = 0;
    lastLon = 0;

    while (pbf.pos < pbf.length) {
      const city = pbf.readMessage(readCity, {
        cityId: 0,
        name: "",
        country: "",
        lat: 0,
        lon: 0,
        population: 0,
      } as City);
      cities.push(city);
    }

    console.log(
      `[cities-loader] Successfully loaded ${cities.length} cities from ${usedPath}`,
    );
    citiesCache = cities;
    return cities;
  } catch (error) {
    console.error("[cities-loader] Failed to load cities:", error);
    return [];
  }
}

function readCity(tag: number, city: City, pbf: Pbf) {
  if (tag === 1) city.cityId = pbf.readSVarint();
  else if (tag === 2) city.name = pbf.readString();
  else if (tag === 3) city.country = pbf.readString();
  else if (tag === 9) city.population = pbf.readVarint();
  else if (tag === 10) {
    lastLon += pbf.readSVarint();
    city.lon = lastLon / 1e5;
  } else if (tag === 11) {
    lastLat += pbf.readSVarint();
    city.lat = lastLat / 1e5;
  }
  // Skip other fields (altName, muni, muniSub, featureCode, adminCode)
  else if (tag === 4) pbf.readString(); // altName
  else if (tag === 5) pbf.readString(); // muni
  else if (tag === 6) pbf.readString(); // muniSub
  else if (tag === 7) pbf.readString(); // featureCode
  else if (tag === 8) pbf.readString(); // adminCode
}

export { loadCitiesFromPbf, type City };
