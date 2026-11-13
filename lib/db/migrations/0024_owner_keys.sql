-- A per-device owner key for each wallet, stored as its SHA-256.
--
-- Changing a name and creating a link code took only the address in the URL,
-- so anyone could rename a player (and then take the freed name) or pull a
-- wallet of their own into someone else's profile. MiniPay cannot sign
-- messages, so the phone that owns the wallet holds this key instead. See
-- lib/ownerKey.ts. Both columns stay null until a key is issued.
ALTER TABLE "users" ADD COLUMN "owner_key_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "owner_key_at" timestamp with time zone;
