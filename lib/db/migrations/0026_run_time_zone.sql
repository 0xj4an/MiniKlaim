-- The zone each run was played in, so its streak day stays put.
--
-- The streak cut every run's day in the zone of the player's latest run, so
-- a trip moved the whole history: days appeared and disappeared with the
-- phone's clock. From here each run keeps the zone it started in.
--
-- Existing runs take the zone their wallet has today. That is the zone they
-- are being cut in right now, so a streak does not change with this (the one
-- exception is a player whose linked wallets carry different zones).
--
-- Both statements can run twice: the column is added on the production
-- database before the code that reads it is deployed (the cron deploy does
-- not run migrations), and this file runs again with the next full deploy.
ALTER TABLE "runs" ADD COLUMN IF NOT EXISTS "time_zone" text;--> statement-breakpoint
UPDATE "runs" r SET "time_zone" = u."time_zone" FROM "users" u WHERE u."address" = r."user_address" AND r."time_zone" IS NULL AND u."time_zone" IS NOT NULL;
