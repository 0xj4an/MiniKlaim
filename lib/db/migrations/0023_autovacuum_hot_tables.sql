-- Clean these two tables far sooner than the default.
--
-- Autovacuum waits until 20% of a table is dead rows. Since blocks gained
-- levels, a pass over a block is an UPDATE and not an INSERT, so `hexes`
-- collects dead rows all day: 1.8%, 3.9%, 9.9% and 13.4% on four days
-- running (10 to 13 Nov 2026), with the last autovacuum on 8 Nov. `runs`
-- sat at 13.8% with none since 4 Nov. Both feed the counts on /stats and
-- the leaderboard.
--
-- At 2% the work is the same, done in smaller pieces. Nothing is read
-- differently: this only changes when the cleaning happens.
ALTER TABLE "hexes" SET (autovacuum_vacuum_scale_factor = 0.02);--> statement-breakpoint
ALTER TABLE "runs" SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_threshold = 200);
