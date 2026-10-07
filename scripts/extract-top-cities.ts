#!/usr/bin/env node
/**
 * Extract top cities from all-the-cities to create a lightweight JSON file
 */
import { writeFileSync } from "fs";

type City = {
  name: string;
  country: string;
  lat: number;
  lon: number;
  population: number;
};

async function main() {
  console.log("Loading all-the-cities...");
  
  const allTheCities = await import("all-the-cities");
  const cities = allTheCities.default as Array<{
    name: string;
    country: string;
    loc: { coordinates: [number, number] };
    population?: number;
  }>;
  
  console.log(`Total cities loaded: ${cities.length}`);
  
  // Convert ALL cities, no filtering - user needs complete coverage
  const converted: City[] = cities
    .map((c) => ({
      name: c.name,
      country: c.country,
      lat: c.loc.coordinates[1],
      lon: c.loc.coordinates[0],
      population: c.population || 0,
    }))
    .filter((c: City) => c.name && c.country); // Only remove invalid entries
  
  console.log(`Converted ALL ${converted.length} cities`);
  
  const json = JSON.stringify(converted);
  writeFileSync("public/data/cities.json", json);
  
  const sizeKB = Buffer.byteLength(json) / 1024;
  console.log(`✅ Created public/data/cities.json (${sizeKB.toFixed(0)}KB)`);
}

main().catch(console.error);
