ALTER TABLE "runs" ADD COLUMN "pending_offers" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "pending_offered_at" timestamp with time zone;