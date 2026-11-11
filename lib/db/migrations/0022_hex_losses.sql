CREATE TABLE "hex_losses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"victim" text NOT NULL,
	"actor" text NOT NULL,
	"h3_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "hex_losses_victim_idx" ON "hex_losses" USING btree ("victim","created_at");