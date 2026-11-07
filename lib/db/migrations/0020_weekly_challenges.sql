CREATE TABLE "challenge_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" text NOT NULL,
	"player" text NOT NULL,
	"tx_hash" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"block_number" bigint NOT NULL,
	"entered_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"title_en" text NOT NULL,
	"title_es" text NOT NULL,
	"badge_ids" integer[] NOT NULL,
	"token" text NOT NULL,
	"entry_amount" numeric(78, 0) NOT NULL,
	"seed_amount" numeric(78, 0) NOT NULL,
	"carry_amount" numeric(78, 0) DEFAULT '0' NOT NULL,
	"pool_bps" integer DEFAULT 8000 NOT NULL,
	"winners" integer NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"entry_closes_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"draw_block" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"drop_id" uuid,
	"rolled_into" text,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_entries_tx_idx" ON "challenge_entries" USING btree ("tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_entries_player_idx" ON "challenge_entries" USING btree ("challenge_id","player");