ALTER TABLE "runs" ADD COLUMN "air_anchor_h3" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "air_anchor_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "airborne" boolean DEFAULT false NOT NULL;