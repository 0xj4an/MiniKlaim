import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// --- Linked identity (Phase C) --------------------------------------------
// A `player` is the canonical cross-chain profile. One player owns many
// `player_wallets` (one per address+chain). Username stays in `users` (single
// source of truth, keyed by address); linked wallets share it by resolving
// through the player to the wallet that has a username set.
export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playerWallets = pgTable(
  "player_wallets",
  {
    address: text("address").notNull(),
    chainId: integer("chain_id").notNull(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    isPrimary: boolean("is_primary").notNull().default(false),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.address, t.chainId] })],
);

// Short-lived codes to link a new wallet to an existing player. Generated from
// an already-connected wallet; redeemed (with a signature) from the new one.
export const linkCodes = pgTable("link_codes", {
  code: text("code").primaryKey(),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const users = pgTable("users", {
  address: text("address").primaryKey(),
  phone: text("phone"),
  username: text("username").unique(),
  // Lifetime count of hexes captured from a different player (recapture where
  // the prior owner was someone else). Drives the conquest badges.
  conquests: integer("conquests").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userAddress: text("user_address")
      .notNull()
      .references(() => users.address),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    hexesClaimed: integer("hexes_claimed").notNull().default(0),
    distanceMeters: integer("distance_meters").notNull().default(0),
  },
  (t) => [
    // Per-user run history queries (/me runs list, streak calc).
    index("runs_user_address_started_at_idx").on(
      t.userAddress,
      t.startedAt,
    ),
    // Retention/analytics cohorts by day (DAU/WAU/MAU).
    index("runs_started_at_idx").on(t.startedAt),
    // Auto-finalize orphan scan (WHERE ended_at IS NULL AND started_at < X).
    index("runs_ended_at_idx").on(t.endedAt),
  ],
);

export const hexes = pgTable(
  "hexes",
  {
    h3Id: text("h3_id").primaryKey(),
    ownerAddress: text("owner_address")
      .notNull()
      .references(() => users.address),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
    mintedAt: timestamp("minted_at", { withTimezone: true }),
    mintTxHash: text("mint_tx_hash"),
    // ISO 3166-1 alpha-3 country of the hex centroid, resolved at capture.
    // Drives the country badges; null when resolution failed or is pending.
    country: text("country"),
  },
  (t) => [
    // "hexes owned by X player" queries (badge eligibility, TerritoryMap).
    // Frequent + high cardinality; without this the badge worker scans the
    // whole table per player.
    index("hexes_owner_address_idx").on(t.ownerAddress),
    // "hexes in this run" queries (voucher endpoint, sponsor-mint fallback,
    // GPS spoof validation rate limit).
    index("hexes_run_id_idx").on(t.runId),
    // Un-minted queue queries (WHERE minted_at IS NULL, retry worker,
    // /stats On-chain counters).
    index("hexes_minted_at_idx").on(t.mintedAt),
    // "hexes in country X" queries (country badges + per-country leaderboard
    // when we add it). Partial (WHERE country IS NOT NULL) since most rows
    // have it and unresolved rows shouldn't clutter the index.
    index("hexes_country_idx").on(t.country),
    // Rate-limit sweep in validateClaim (WHERE run_id = X AND claimed_at > NOW - 60s).
    // Compound with claimedAt for the range scan.
    index("hexes_run_id_claimed_at_idx").on(t.runId, t.claimedAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Hex = typeof hexes.$inferSelect;
export type NewHex = typeof hexes.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type PlayerWallet = typeof playerWallets.$inferSelect;
export type NewPlayerWallet = typeof playerWallets.$inferInsert;
