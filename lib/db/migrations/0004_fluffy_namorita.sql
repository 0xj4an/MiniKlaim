CREATE TABLE "link_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_wallets" (
	"address" text NOT NULL,
	"chain_id" integer NOT NULL,
	"player_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_wallets_address_chain_id_pk" PRIMARY KEY("address","chain_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "link_codes" ADD CONSTRAINT "link_codes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_wallets" ADD CONSTRAINT "player_wallets_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Backfill: one player per existing user, with its address as a primary Celo
-- wallet. Idempotent (skips addresses already mapped). Username stays in users.
DO $$
DECLARE u RECORD; pid uuid;
BEGIN
  FOR u IN SELECT address, created_at FROM users LOOP
    IF NOT EXISTS (
      SELECT 1 FROM player_wallets WHERE address = u.address AND chain_id = 42220
    ) THEN
      INSERT INTO players (created_at) VALUES (u.created_at) RETURNING id INTO pid;
      INSERT INTO player_wallets (address, chain_id, player_id, is_primary, linked_at)
        VALUES (u.address, 42220, pid, true, u.created_at);
    END IF;
  END LOOP;
END $$;
