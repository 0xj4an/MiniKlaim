#!/usr/bin/env tsx
/**
 * Check today's stats: transactions, users, hexes claimed, gas spent
 */
import { db } from "@/db";
import { runs, hexes } from "@/db/schema";
import { sql, count, countDistinct } from "drizzle-orm";

async function main() {
  console.log("=== MiniKlaim Stats - Oct 7, 2026 ===\n");

  // Total stats
  const [totalRuns] = await db.select({ count: count() }).from(runs);
  const [totalHexes] = await db.select({ count: count() }).from(hexes);
  const [uniqueUsers] = await db
    .select({ count: countDistinct(runs.address) })
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

  console.log(`\n📈 Stats HOY (${today}):`);
  if (todayStats.rows && todayStats.rows[0]) {
    const stats = todayStats.rows[0] as any;
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

  console.log("\n🌍 Top 10 Países HOY:");
  if (topCountries.rows && topCountries.rows.length > 0) {
    topCountries.rows.forEach((row: any, i: number) => {
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

  console.log("\n🏃 Últimos 10 Runs HOY:");
  if (recentRuns.rows && recentRuns.rows.length > 0) {
    recentRuns.rows.forEach((row: any) => {
      const time = new Date(row.created_at).toLocaleTimeString();
      const addr = `${row.address.slice(0, 6)}...${row.address.slice(-4)}`;
      console.log(
        `  ${time} | ${addr} | ${row.state} | ${row.hex_count || 0} hexes`,
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
