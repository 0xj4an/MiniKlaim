import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { gridDisk, latLngToCell } from "h3-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hexes, runs, users } from "../lib/db/schema";

const HEX_RESOLUTION = 12;

const seedCities = [
  // LATAM
  { username: "bogotacorre", lat: 4.711, lng: -74.0721, ringSize: 2 },
  { username: "cdmxruns", lat: 19.4326, lng: -99.1332, ringSize: 2 },
  { username: "porteno", lat: -34.6037, lng: -58.3816, ringSize: 3 },
  { username: "paulista", lat: -23.5505, lng: -46.6333, ringSize: 1 },
  { username: "rio2016", lat: -22.9068, lng: -43.1729, ringSize: 2 },
  { username: "limeno", lat: -12.0464, lng: -77.0428, ringSize: 1 },
  { username: "santiagochi", lat: -33.4489, lng: -70.6693, ringSize: 2 },
  { username: "caracas", lat: 10.4806, lng: -66.9036, ringSize: 1 },
  { username: "quitoec", lat: -0.1807, lng: -78.4678, ringSize: 1 },
  { username: "habana", lat: 23.1136, lng: -82.3666, ringSize: 1 },
  { username: "panaviejo", lat: 8.9824, lng: -79.5199, ringSize: 1 },
  { username: "guayaco", lat: -2.1709, lng: -79.9224, ringSize: 1 },
  { username: "tegus", lat: 14.0723, lng: -87.1921, ringSize: 1 },
  { username: "mtyrun", lat: 25.6866, lng: -100.3161, ringSize: 1 },
  // North America
  { username: "newyorker", lat: 40.7128, lng: -74.006, ringSize: 3 },
  { username: "torontorun", lat: 43.6532, lng: -79.3832, ringSize: 2 },
  { username: "chicagoer", lat: 41.8781, lng: -87.6298, ringSize: 2 },
  { username: "sfbayrun", lat: 37.7749, lng: -122.4194, ringSize: 2 },
  { username: "lalovesrun", lat: 34.0522, lng: -118.2437, ringSize: 2 },
  { username: "miami305", lat: 25.7617, lng: -80.1918, ringSize: 1 },
  { username: "atxruns", lat: 30.2672, lng: -97.7431, ringSize: 1 },
  { username: "seattlerain", lat: 47.6062, lng: -122.3321, ringSize: 1 },
  { username: "denver5280", lat: 39.7392, lng: -104.9903, ringSize: 1 },
  { username: "vancouverbc", lat: 49.2827, lng: -123.1207, ringSize: 1 },
  // Europe
  { username: "madrileno", lat: 40.4168, lng: -3.7038, ringSize: 2 },
  { username: "berliner", lat: 52.52, lng: 13.405, ringSize: 1 },
  { username: "parisien", lat: 48.8566, lng: 2.3522, ringSize: 2 },
  { username: "londoner", lat: 51.5074, lng: -0.1278, ringSize: 2 },
  { username: "barcelonita", lat: 41.3851, lng: 2.1734, ringSize: 1 },
  { username: "amsterdammer", lat: 52.3676, lng: 4.9041, ringSize: 1 },
  { username: "milanese", lat: 45.4642, lng: 9.19, ringSize: 1 },
  { username: "athenian", lat: 37.9838, lng: 23.7275, ringSize: 1 },
  { username: "lisbeta", lat: 38.7223, lng: -9.1393, ringSize: 1 },
  { username: "stockholmer", lat: 59.3293, lng: 18.0686, ringSize: 1 },
  { username: "warszawa", lat: 52.2297, lng: 21.0122, ringSize: 1 },
  { username: "praguer", lat: 50.0755, lng: 14.4378, ringSize: 1 },
  { username: "istanbultr", lat: 41.0082, lng: 28.9784, ringSize: 2 },
  // Africa
  { username: "lagosrunner", lat: 6.5244, lng: 3.3792, ringSize: 2 },
  { username: "nairobikenya", lat: -1.2921, lng: 36.8219, ringSize: 1 },
  { username: "caironile", lat: 30.0444, lng: 31.2357, ringSize: 2 },
  { username: "joburgsa", lat: -26.2041, lng: 28.0473, ringSize: 1 },
  { username: "capetown", lat: -33.9249, lng: 18.4241, ringSize: 1 },
  { username: "accraghana", lat: 5.6037, lng: -0.187, ringSize: 1 },
  { username: "dakarrun", lat: 14.7167, lng: -17.4677, ringSize: 1 },
  { username: "addisaa", lat: 9.03, lng: 38.7469, ringSize: 1 },
  { username: "kigaliruns", lat: -1.9706, lng: 30.1044, ringSize: 1 },
  { username: "marrakech", lat: 31.6295, lng: -7.9811, ringSize: 1 },
  // Asia
  { username: "tokyojog", lat: 35.6762, lng: 139.6503, ringSize: 2 },
  { username: "seoulrun", lat: 37.5665, lng: 126.978, ringSize: 2 },
  { username: "shanghai", lat: 31.2304, lng: 121.4737, ringSize: 2 },
  { username: "beijingrun", lat: 39.9042, lng: 116.4074, ringSize: 1 },
  { username: "hongkong852", lat: 22.3193, lng: 114.1694, ringSize: 1 },
  { username: "singaporesg", lat: 1.3521, lng: 103.8198, ringSize: 1 },
  { username: "bangkokbkk", lat: 13.7563, lng: 100.5018, ringSize: 1 },
  { username: "jakartaid", lat: -6.2088, lng: 106.8456, ringSize: 1 },
  { username: "manilaph", lat: 14.5995, lng: 120.9842, ringSize: 1 },
  { username: "delhicorre", lat: 28.7041, lng: 77.1025, ringSize: 2 },
  { username: "mumbairun", lat: 19.076, lng: 72.8777, ringSize: 1 },
  { username: "bangaloreit", lat: 12.9716, lng: 77.5946, ringSize: 1 },
  { username: "dubai971", lat: 25.2048, lng: 55.2708, ringSize: 1 },
  { username: "telavivil", lat: 32.0853, lng: 34.7818, ringSize: 1 },
  { username: "karachi", lat: 24.8607, lng: 67.0011, ringSize: 1 },
  // Oceania
  { username: "sydneywalk", lat: -33.8688, lng: 151.2093, ringSize: 1 },
  { username: "melbourner", lat: -37.8136, lng: 144.9631, ringSize: 1 },
  { username: "aucklandnz", lat: -36.8485, lng: 174.7633, ringSize: 1 },
];

function randomAddress(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0").repeat(5).slice(0, 40);
  return `0x${hex}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client);

  const now = Date.now();

  for (const city of seedCities) {
    const address = randomAddress(city.username).toLowerCase();
    const centerHex = latLngToCell(city.lat, city.lng, HEX_RESOLUTION);
    const cells = gridDisk(centerHex, city.ringSize);

    await db
      .insert(users)
      .values({
        address,
        username: city.username,
        createdAt: new Date(now - 1000 * 60 * 60 * 24 * 14),
      })
      .onConflictDoNothing();

    const distance = cells.length * 60 + 200;
    const startedAt = new Date(now - 1000 * 60 * 60 * 6);
    const endedAt = new Date(now - 1000 * 60 * 60 * 6 + 1000 * 60 * 30);

    const inserted = await db
      .insert(runs)
      .values({
        userAddress: address,
        startedAt,
        endedAt,
        hexesClaimed: cells.length,
        distanceMeters: distance,
      })
      .returning({ id: runs.id });

    const runId = inserted[0]?.id;

    for (const cell of cells) {
      await db
        .insert(hexes)
        .values({
          h3Id: cell,
          ownerAddress: address,
          claimedAt: startedAt,
          runId,
        })
        .onConflictDoNothing();
    }

    console.log(
      `seeded ${city.username}: ${cells.length} blocks at ${city.lat},${city.lng}`,
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
