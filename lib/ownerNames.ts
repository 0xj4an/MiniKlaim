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

/** Owners asked for per query: well under Postgres' parameter limit. */
const NAME_CHUNK = 1_000;

/**
 * address -> username for a set of owners, by primary key, in chunks.
 *
 * For lists too large to carry a join (the world list: every block on the
 * map, a few thousand owners). Owners without a users row are simply absent.
 */
export async function ownerNameMap(
  owners: Iterable<string>,
  load: OwnerNameLoader = loadFromDb,
): Promise<Map<string, string | null>> {
  const all = [...new Set(owners)];
  const names = new Map<string, string | null>();
  for (let i = 0; i < all.length; i += NAME_CHUNK) {
    for (const u of await load(all.slice(i, i + NAME_CHUNK))) {
      names.set(u.address, u.username);
    }
  }
  return names;
}
