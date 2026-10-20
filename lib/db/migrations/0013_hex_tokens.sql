ALTER TABLE "hexes" ADD COLUMN "token_at" timestamp with time zone;--> statement-breakpoint
-- Every hex settled so far was minted as a token (Hexes v1).
UPDATE "hexes" SET "token_at" = "minted_at" WHERE "minted_at" IS NOT NULL AND "token_at" IS NULL;
