import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import postgres from "postgres";
import { captureBatch } from "../lib/onchain/hexes";
import { hexes } from "../lib/db/schema";
import type { Address } from "viem";

const player = process.argv[2];
if (!player || !player.startsWith("0x") || player.length !== 42) {
  console.error("Usage: pnpm tsx scripts/backfill-mints.ts <0xPlayerAddress>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sqlClient = postgres(databaseUrl, { max: 1 });
const db = drizzle(sqlClient);

const lower = player.toLowerCase() as Address;

const rows = await db
  .select({ h3Id: hexes.h3Id })
  .from(hexes)
  .where(and(eq(hexes.ownerAddress, lower), isNull(hexes.mintedAt)));

const ids = rows.map((r) => r.h3Id);
console.log(`Found ${ids.length} unminted hexes for ${lower}`);
if (ids.length === 0) {
  await sqlClient.end();
  process.exit(0);
}

const BATCH_SIZE = 50;
for (let i = 0; i < ids.length; i += BATCH_SIZE) {
  const batch = ids.slice(i, i + BATCH_SIZE);
  console.log(`Minting batch ${i / BATCH_SIZE + 1}: ${batch.length} hexes...`);
  const result = await captureBatch(lower, batch);
  if (result.ok !== true) {
    console.error("captureBatch failed:", result);
    await sqlClient.end();
    process.exit(1);
  }
  console.log(`  -> tx: ${result.txHash}`);
  await db
    .update(hexes)
    .set({ mintedAt: sql`now()`, mintTxHash: result.txHash })
    .where(and(eq(hexes.ownerAddress, lower), inArray(hexes.h3Id, batch)));
}

console.log("Done.");
await sqlClient.end();
