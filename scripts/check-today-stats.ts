#!/usr/bin/env tsx
/**
 * Check today's stats: transactions, users, hexes claimed, gas spent
 */
import { db } from "@/lib/db";
import { runs, hexes } from "@/lib/db/schema";
import { sql, count, countDistinct } from "drizzle-orm";

async function main() {
  console.log("=== MiniKlaim Stats - Oct 7, 2026 ===\n");

  // Total stats
  const [totalRuns] = await db.select({ count: count() }).from(runs);
  const [totalHexes] = await db.select({ count: count() }).from(hexes);
  const [uniqueUsers] = await db
    .select({ count: countDistinct(runs.userAddress) })
    .from(runs);

  console.log("📊 Stats Totales:");
  console.log(`  Total Runs: ${totalRuns.count.toLocaleString()}`);
  console.log(`  Total Hexes: ${totalHexes.count.toLocaleString()}`);
  console.log(`  Usuarios Únicos: ${uniqueUsers.count.toLocaleString()}`);

  // Today's stats
  const today = "2026-10-07";
  const todayStats = await db.execute(sql`
    SELECT 
      COUNT(DISTINCT r.address) as active_users,
      COUNT(DISTINCT r.id) as runs_today,
      COUNT(DISTINCT h.h3_id) as hexes_today
    FROM runs r
    LEFT JOIN hexes h ON DATE(h.claimed_at) = ${today}
    WHERE DATE(r.created_at) = ${today}
  `);

  console.log(`\nStats HOY (${today}):`);
  const stats = todayStats[0] as {
    active_users?: string | number | null;
    runs_today?: string | number | null;
    hexes_today?: string | number | null;
  } | undefined;
  if (stats) {
    console.log(`  Usuarios Activos: ${stats.active_users || 0}`);
    console.log(`  Runs Creados: ${stats.runs_today || 0}`);
    console.log(`  Hexes Claimed: ${stats.hexes_today || 0}`);
  }

  // Top countries today
  const topCountries = await db.execute(sql`
    SELECT 
      country,
      COUNT(*) as hex_count
    FROM hexes
    WHERE DATE(claimed_at) = ${today}
      AND country IS NOT NULL
    GROUP BY country
    ORDER BY hex_count DESC
    LIMIT 10
  `);

  console.log("\nTop 10 paises HOY:");
  if (topCountries.length > 0) {
    topCountries.forEach((row: {
      country?: string | null;
      hex_count?: string | number | null;
    }, i: number) => {
      console.log(`  ${i + 1}. ${row.country}: ${row.hex_count} hexes`);
    });
  } else {
    console.log("  No hay datos de países para hoy");
  }

  // Recent runs
  const recentRuns = await db.execute(sql`
    SELECT 
      id,
      address,
      created_at,
      state,
      (SELECT COUNT(*) FROM hexes WHERE run_id = runs.id) as hex_count
    FROM runs
    WHERE DATE(created_at) = ${today}
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log("\nUltimos 10 runs HOY:");
  if (recentRuns.length > 0) {
    recentRuns.forEach((row: {
      address: string;
      created_at: string | number | Date;
      state?: string | null;
      hex_count?: string | number | null;
    }) => {
      const time = new Date(row.created_at).toLocaleTimeString();
      console.log(
        `  ${time} | ${row.address} | ${row.state} | ${row.hex_count || 0} hexes`,
      );
    });
  } else {
    console.log("  No hay runs para hoy");
  }

  // Blockchain contract check
  console.log("\n💰 Contratos en Celo:");
  console.log("  Hexes: 0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B");
  console.log("  Badges: 0x79c5d6365f447d1F707EA6d4bDE5D6A96f181cf7");
  console.log("  Link Verifier: 0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83");
  console.log(
    "\n  🔗 Ver en explorer: https://celoscan.io/address/0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B",
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
