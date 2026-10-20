-- Hexes v2 went live on Celo mainnet at 2026-10-20T16:29:58Z
-- (upgrade tx 0x758bec335bf86f16ae325fec35090111728965f3d3579e1054c8e3eb71c8d227).
-- Hexes settled before that were minted as tokens.
UPDATE "hexes" SET "token_at" = "minted_at" WHERE "minted_at" < '2026-10-20T16:29:58Z' AND "token_at" IS NULL;--> statement-breakpoint
-- Settled after it, before NEXT_PUBLIC_CELO_HEXES_RECORDS was on, the app still
-- marked them as tokens; under v2 they were only recorded.
UPDATE "hexes" SET "token_at" = NULL WHERE "token_at" >= '2026-10-20T16:29:58Z';
