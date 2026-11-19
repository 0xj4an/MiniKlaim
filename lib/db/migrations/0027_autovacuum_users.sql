-- `users` never reaches the default 20% trigger: 12.3k live rows with 1,011
-- dead (8.2%) on 19 Nov 2026 and no autovacuum since 29 Oct. Every update to
-- a player (streaks, time zone, conquests) leaves a dead row, and the counts
-- and joins on this table read them. Same setting as `runs` and `hex_actions`.
ALTER TABLE "users" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 200);
