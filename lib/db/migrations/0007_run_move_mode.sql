ALTER TABLE "runs" ADD COLUMN "move_mode" text;--> statement-breakpoint
UPDATE "runs"
SET "move_mode" = CASE
  WHEN ended_at IS NULL OR ended_at <= started_at THEN NULL
  WHEN distance_meters < 30 OR EXTRACT(EPOCH FROM (ended_at - started_at)) < 20 THEN NULL
  WHEN (distance_meters / EXTRACT(EPOCH FROM (ended_at - started_at))) * 3.6 >= 100 THEN 'plane'
  WHEN (distance_meters / EXTRACT(EPOCH FROM (ended_at - started_at))) * 3.6 >= 40 THEN 'car'
  WHEN (distance_meters / EXTRACT(EPOCH FROM (ended_at - started_at))) * 3.6 >= 15 THEN 'bike'
  ELSE 'foot'
END
WHERE ended_at IS NOT NULL;
