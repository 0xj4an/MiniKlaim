-- The table 0023 left out. `hex_actions` is the one the cron prunes every
-- day, so each prune leaves thousands of dead rows at once: 11.6% dead
-- (7,601 of 65,613) on 14 Nov 2026, a day after its last autovacuum. Same
-- setting as `runs`: cleaned at 2% instead of 20%.
ALTER TABLE "hex_actions" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 200);
