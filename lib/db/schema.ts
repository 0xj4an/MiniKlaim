import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  address: text("address").primaryKey(),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const runs = pgTable("runs", {
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
});

export const hexes = pgTable("hexes", {
  h3Id: text("h3_id").primaryKey(),
  ownerAddress: text("owner_address")
    .notNull()
    .references(() => users.address),
  claimedAt: timestamp("claimed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  runId: uuid("run_id").references(() => runs.id, { onDelete: "set null" }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Hex = typeof hexes.$inferSelect;
export type NewHex = typeof hexes.$inferInsert;
