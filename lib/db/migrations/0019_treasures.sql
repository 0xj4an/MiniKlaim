CREATE TABLE "drop_finds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"player" text NOT NULL,
	"run_id" uuid NOT NULL,
	"first_near_at" timestamp with time zone NOT NULL,
	"last_near_at" timestamp with time zone NOT NULL,
	"near_batches" integer DEFAULT 1 NOT NULL,
	"crossed_at" timestamp with time zone,
	"accuracy_m" integer,
	"review" text DEFAULT 'pending' NOT NULL,
	"review_reason" text,
	"found_at" timestamp with time zone,
	"nonce" numeric(78, 0),
	"claim_requested_at" timestamp with time zone,
	"claim_tx" text,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"h3" text NOT NULL,
	"hint_h3" text NOT NULL,
	"label" text,
	"clue" text,
	"token" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"max_winners" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"salt" text NOT NULL,
	"commitment" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sponsor" text,
	"batch" text,
	"create_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drop_finds" ADD CONSTRAINT "drop_finds_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drop_finds_drop_run_idx" ON "drop_finds" USING btree ("drop_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drop_finds_one_prize_idx" ON "drop_finds" USING btree ("drop_id","player") WHERE review = 'ok';--> statement-breakpoint
CREATE INDEX "drop_finds_player_idx" ON "drop_finds" USING btree ("player");--> statement-breakpoint
CREATE INDEX "drops_status_idx" ON "drops" USING btree ("status");--> statement-breakpoint
CREATE INDEX "drops_h3_idx" ON "drops" USING btree ("h3");