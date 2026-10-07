/**
 * Custom loader for cities database that works in serverless environments
 * where the original all-the-cities loader fails to find cities.pbf
 */
import { readFileSync } from "fs";
import { join } from "path";
import Pbf from "pbf";

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
    // Try multiple possible locations for cities.pbf
    const possiblePaths = [
      // In node_modules (development)
      join(process.cwd(), "node_modules", "all-the-cities", "cities.pbf"),
      // In .next/server (production build)
      join(
        process.cwd(),
        ".next",
        "server",
        "vendor",
        "all-the-cities",
        "cities.pbf",
      ),
      // Railway/serverless (might be at root)
      "/ROOT/node_modules/all-the-cities/cities.pbf",
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
      console.error(
        "[cities-loader] Could not find cities.pbf in any location",
      );
      console.error("[cities-loader] Tried:", possiblePaths);
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
