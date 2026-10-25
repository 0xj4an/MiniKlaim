-- Hex strength (lib/runs/hexStrength.ts). Every existing block starts at
-- level 1 with no damage. `reinforced_at` defaults to now(): the decay clock
-- starts when this ships, so no block loses a level for time before strength
-- existed. Constant defaults, so Postgres does not rewrite the hexes table.
CREATE TABLE "hex_actions" (
	"h3_id" text NOT NULL,
	"player_key" text NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hex_actions_h3_id_player_key_day_pk" PRIMARY KEY("h3_id","player_key","day")
);
--> statement-breakpoint
ALTER TABLE "hexes" ADD COLUMN "base_strength" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hexes" ADD COLUMN "damage" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hexes" ADD COLUMN "reinforced_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "hexes_reinforced" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "hexes_damaged" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "hex_actions_day_idx" ON "hex_actions" USING btree ("day");--> statement-breakpoint
ALTER TABLE "hexes" ADD CONSTRAINT "hexes_strength_range" CHECK ("hexes"."base_strength" BETWEEN 1 AND 10 AND "hexes"."damage" >= 0 AND "hexes"."damage" < "hexes"."base_strength");