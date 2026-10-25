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
  // IANA time zone the phone reported when the player last started a run.
  // Streak days are cut at local midnight in this zone (UTC when null).
  timeZone: text("time_zone"),
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
    // foot, bike, car, or plane. Null when the run is too short to tell.
    moveMode: text("move_mode"),
    // sha256 of the per-run token handed to the client that started the run.
    // Sponsor and decline calls must present it. Null for runs started before
    // the token existed.
    claimTokenHash: text("claim_token_hash"),
    // Why the run is or is not minted: claimed, declined, sponsored,
    // sponsor_denied, sponsor_capped, sponsor_failed. Null until the client
    // reports. The retry cron only picks up sponsor_failed.
    mintStatus: text("mint_status"),
    mintStatusAt: timestamp("mint_status_at", { withTimezone: true }),
    // How many separate visits showed this unminted run in the pending-claim
    // prompt (at most one per OFFER_COOLDOWN). After enough offers a player
    // with no fee balance gets it minted by the relayer.
    pendingOffers: integer("pending_offers").notNull().default(0),
    pendingOfferedAt: timestamp("pending_offered_at", { withTimezone: true }),
    // Movement guard (lib/runs/movementGuard.ts): where the run last captured,
    // when, the server-measured hex path, and how many hexes it refused.
    lastH3: text("last_h3"),
    lastClaimAt: timestamp("last_claim_at", { withTimezone: true }),
    serverDistanceMeters: integer("server_distance_meters").notNull().default(0),
    rejectedHexes: integer("rejected_hexes").notNull().default(0),
    // In-flight check (airborneStep): where and when the speed window
    // starts, and the last decision, which holds until the next measurement.
    airAnchorH3: text("air_anchor_h3"),
    airAnchorAt: timestamp("air_anchor_at", { withTimezone: true }),
    airborne: boolean("airborne").notNull().default(false),
    // Server hex path at the air anchor, and the best sustained (30 s+)
    // speed along the path so far: tells a car in traffic from a bike.
    airAnchorMeters: integer("air_anchor_meters"),
    maxSustainedKmh: integer("max_sustained_kmh"),
    // How the player said they would travel, picked before Start.
    declaredMode: text("declared_mode"),
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
    // Retry cron scan (WHERE mint_status = 'sponsor_failed').
    index("runs_mint_status_idx").on(t.mintStatus),
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
    // Set once this hex is settled on-chain (recorded, or minted before v2).
    // Cleared on recapture so the new owner's settlement runs.
    mintedAt: timestamp("minted_at", { withTimezone: true }),
    mintTxHash: text("mint_tx_hash"),
    // Set when the hex exists as an ERC-721 token (every v1 mint, or a v2
    // `mintTokens`). Not cleared on recapture: the token stays on-chain and
    // the next settlement moves it to the new owner. A cache of the chain;
    // the token voucher re-checks `ownerOf` before signing.
    tokenAt: timestamp("token_at", { withTimezone: true }),
    // ISO 3166-1 alpha-3 country of the hex centroid, resolved at capture.
    // Drives the country badges; null when resolution failed or is pending.
    country: text("country"),
    // City name of the hex centroid, resolved at capture. Null when resolution
    // failed, is pending, or the coordinates fall outside a city boundary.
    city: text("city"),
  },
  (t) => [
    // "hexes owned by X player" queries (badge eligibility, TerritoryMap).
    // Frequent + high cardinality; without this the badge worker scans the
    // whole table per player.
    index("hexes_owner_address_idx").on(t.ownerAddress),
    // "hexes in this run" queries (voucher endpoint, no-balance sponsor mint).
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

/**
 * One row per relayer transaction paid on a player's behalf. Drives the daily
 * per-wallet sponsor cap and makes relayer spend auditable per player.
 */
export const sponsoredMints = pgTable(
  "sponsored_mints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userAddress: text("user_address").notNull(),
    runId: uuid("run_id"),
    // "hexes" or "badges".
    kind: text("kind").notNull(),
    count: integer("count").notNull(),
    txHash: text("tx_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sponsored_mints_user_created_idx").on(t.userAddress, t.createdAt),
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
