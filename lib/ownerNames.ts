import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Usernames for a list of hexes, looked up by owner instead of joined.
 *
 * The scoped hex lists used `hexes LEFT JOIN users`. With a few hundred cells
 * in the IN list Postgres picks a hash join and reads the whole users table to
 * build it: on 19 Nov 2026 that plan was most of the ~500 to 960 sequential
 * scans of `users` an hour. A run screen's 700 cells have a handful of
 * owners, so asking for those owners by primary key reads a few rows instead.
 */
export type OwnerNameLoader = (
  addresses: string[],
) => Promise<{ address: string; username: string | null }[]>;

const loadFromDb: OwnerNameLoader = (addresses) =>
  db
    .select({ address: users.address, username: users.username })
    .from(users)
    .where(inArray(users.address, addresses));

export async function withOwnerNames<T extends { owner: string | null }>(
  rows: T[],
  load: OwnerNameLoader = loadFromDb,
): Promise<(T & { ownerUsername: string | null })[]> {
  const owners = [
    ...new Set(rows.map((r) => r.owner).filter((o): o is string => !!o)),
  ];
  const names = new Map<string, string | null>();
  if (owners.length > 0) {
    for (const u of await load(owners)) names.set(u.address, u.username);
  }
  return rows.map((r) => ({
    ...r,
    ownerUsername: r.owner ? (names.get(r.owner) ?? null) : null,
  }));
}
