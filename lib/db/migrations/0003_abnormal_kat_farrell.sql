ALTER TABLE "hexes" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "conquests" integer DEFAULT 0 NOT NULL;