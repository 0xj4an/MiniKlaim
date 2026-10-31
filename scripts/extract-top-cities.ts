#!/usr/bin/env node
/**
 * Writes `public/data/cities.bin`, the table `lib/geo/city.ts` reads.
 *
 * Runs as `prebuild`. It used to emit JSON — one object per city, 11 MB on
 * disk and ~46 MB of heap once parsed, with a per-country Map built on top
 * at runtime. The binary table is typed arrays plus one names blob, so the
 * same 135k cities cost a handful of allocations. Nothing is trimmed: the
 * file the old loader's comment described ("top 5000") never existed, and
 * dropping small cities would just mean worse city names in the places
 * where most players actually are.
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { type CityInput, decodeCities, encodeCities } from "../lib/geo/citiesBinary";

const OUT = "public/data/cities.bin";

async function main() {
  const allTheCities = await import("all-the-cities");
  const raw = allTheCities.default as Array<{
    name: string;
    country: string;
    loc: { coordinates: [number, number] };
    population?: number;
  }>;

  const cities: CityInput[] = raw
    .filter((c) => c.name && c.country?.length === 2)
    .map((c) => ({
      name: c.name,
      country: c.country,
      lat: c.loc.coordinates[1],
      lon: c.loc.coordinates[0],
      population: c.population || 0,
    }));

  const bytes = encodeCities(cities);

  // Read it back before writing it: a table that does not decode is worse
  // than no table, because the app would start fine and resolve no city.
  const check = decodeCities(bytes);
  if (check.cityCount !== cities.length) {
    throw new Error(
      `encoded ${cities.length} cities but decoded ${check.cityCount}`,
    );
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, bytes);
  console.log(
    `${OUT}: ${cities.length} cities, ${check.countryCodes.length} countries, ` +
      `${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
