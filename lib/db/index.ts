import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createLogger } from "@/lib/logger";

const log = createLogger("db");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// `max` is postgres.js's default, written down on purpose. Four processes
// share this database (the app, its standby and two crons), so 10 each is
// 40 of the server's 100 connections, and the pool is what queues when the
// host stalls. On 9 Nov 2026 Postgres logged "too many clients already"
// during a memory episode: the headroom is real and should not be raised
// without counting the other processes first.
const client = postgres(connectionString, { prepare: false, max: 10 });
export const db = drizzle(client);

log.info("db client initialized");
