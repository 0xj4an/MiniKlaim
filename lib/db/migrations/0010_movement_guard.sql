ALTER TABLE "runs" ADD COLUMN "last_h3" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "last_claim_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "server_distance_meters" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "rejected_hexes" integer DEFAULT 0 NOT NULL;