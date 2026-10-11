CREATE TABLE "sponsored_mints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_address" text NOT NULL,
	"run_id" uuid,
	"kind" text NOT NULL,
	"count" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "claim_token_hash" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "mint_status" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "mint_status_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sponsored_mints_user_created_idx" ON "sponsored_mints" USING btree ("user_address","created_at");--> statement-breakpoint
CREATE INDEX "runs_mint_status_idx" ON "runs" USING btree ("mint_status");