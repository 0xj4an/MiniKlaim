import { readFileSync } from "fs";
import { join } from "path";
import { createLogger } from "@/lib/logger";
import { type CityTable, decodeCities } from "@/lib/geo/citiesBinary";

const log = createLogger("geo:cities");

let cache: CityTable | null = null;
let tried = false;

const PATHS = [
  join(process.cwd(), "public", "data", "cities.bin"),
  join(process.cwd(), ".next", "server", "data", "cities.bin"),
];

/**
 * The city table, read once per process. `npm run prebuild` writes the file;
 * when it is missing, city resolution degrades to null rather than failing,
 * which is how it has always behaved — a block with no city still counts.
 */
export function loadCities(): CityTable | null {
  if (cache || tried) return cache;
  tried = true;
  for (const path of PATHS) {
    try {
      const table = decodeCities(readFileSync(path));
      log.info("cities loaded", { cities: table.cityCount, path });
      cache = table;
      return cache;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        log.error("cities file unreadable", {
          path,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  log.warn("no cities file; city names will be null", { looked: PATHS });
  return null;
}

/** Test seam: drop the cached table so the next call reads again. */
export function resetCitiesCache(): void {
  cache = null;
  tried = false;
}
