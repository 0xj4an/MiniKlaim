/**
 * LIGHTWEIGHT cities loader using JSON instead of PBF
 * Top 5000 cities (~418KB) instead of 138k cities (6.2MB)
 */
import { readFileSync } from "fs";
import { join } from "path";

type City = {
  name: string;
  country: string;
  lat: number;
  lon: number;
  population: number;
};

let citiesCache: City[] | null = null;

function loadCitiesFromPbf(): City[] {
  if (citiesCache) return citiesCache;

  try {
    const jsonPaths = [
      join(process.cwd(), "public", "data", "cities.json"),
      join(process.cwd(), ".next", "server", "data", "cities.json"),
    ];

    for (const path of jsonPaths) {
      try {
        const data = readFileSync(path, "utf-8");
        const cities = JSON.parse(data) as City[];
        console.log(
          `[cities-loader] Loaded ${cities.length} cities from: ${path}`,
        );
        citiesCache = cities;
        return cities;
      } catch {
        continue;
      }
    }

    console.log("[cities-loader] Cities database not found");
    return [];
  } catch (error) {
    console.error("[cities-loader] Failed to load cities:", error);
    return [];
  }
}

export { loadCitiesFromPbf, type City };
