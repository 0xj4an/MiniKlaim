ALTER TABLE "hexes" ADD COLUMN "minted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hexes" ADD COLUMN "mint_tx_hash" text;