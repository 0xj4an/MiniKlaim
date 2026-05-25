import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badgesContractAddress } from "@/lib/onchain/badges";
import { hexesContractAddress } from "@/lib/onchain/hexes";

export const dynamic = "force-dynamic";

type Row<T> = T;

export async function GET() {
  const queries = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS c FROM users`),
    db.execute(sql`SELECT COUNT(*)::int AS c FROM hexes`),
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM runs WHERE ended_at IS NOT NULL`,
    ),
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM runs WHERE ended_at >= now() - interval '24 hours'`,
    ),
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM runs WHERE ended_at >= now() - interval '7 days'`,
    ),
    db.execute(
      sql`SELECT COUNT(DISTINCT user_address)::int AS c FROM runs WHERE ended_at >= now() - interval '7 days'`,
    ),
    db.execute(
      sql`SELECT COALESCE(SUM(distance_meters), 0)::int AS c FROM runs`,
    ),
    // On-chain: hexes that have been minted as ERC-721 NFTs
    db.execute(
      sql`SELECT COUNT(*)::int AS c FROM hexes WHERE minted_at IS NOT NULL`,
    ),
    // On-chain: unique captureBatch tx hashes (1 per finished-and-minted run)
    db.execute(
      sql`SELECT COUNT(DISTINCT mint_tx_hash)::int AS c FROM hexes WHERE mint_tx_hash IS NOT NULL`,
    ),
    // On-chain: unique player addresses that received at least one NFT
    db.execute(
      sql`SELECT COUNT(DISTINCT owner_address)::int AS c FROM hexes WHERE minted_at IS NOT NULL`,
    ),
  ]);

  const [
    users,
    hexes,
    runsLifetime,
    runs24h,
    runs7d,
    activePlayers7d,
    distance,
    hexesOnchain,
    captureTxs,
    onchainHolders,
  ] = queries.map(
    (q) => (q as unknown as Row<Array<{ c: number }>>)[0]?.c ?? 0,
  );

  return NextResponse.json({
    totalPlayers: users,
    totalBlocks: hexes,
    runsLifetime,
    runs24h,
    runs7d,
    activePlayers7d,
    totalDistanceMeters: distance,
    // On-chain section
    hexesOnchain,
    captureTxs,
    onchainHolders,
    hexesContract: hexesContractAddress(),
    badgesContract: badgesContractAddress(),
    chain: "celo",
    chainId: 42220,
  });
}
