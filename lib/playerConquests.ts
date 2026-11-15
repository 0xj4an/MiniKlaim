import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * A player's conquests: the sum over every wallet linked to them.
 *
 * Conquests are counted per wallet, and each route added them up its own
 * way. The public profile read one wallet while /stats and the badges
 * summed them all, so on 15 Nov 2026 the same player showed 728 on one
 * screen and 979 on the other. One query, used by all three.
 */
export async function conquestsOf(addresses: string[]): Promise<number> {
  if (addresses.length === 0) return 0;
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${users.conquests}), 0)::int` })
    .from(users)
    .where(inArray(users.address, addresses));
  return Number(row?.total ?? 0);
}
