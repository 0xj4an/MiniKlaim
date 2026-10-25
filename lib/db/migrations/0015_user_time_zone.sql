ALTER TABLE "users" ADD COLUMN "time_zone" text;--> statement-breakpoint
-- Best-effort zone for players who have not started a run since the client
-- began sending its time zone: the main zone of the country where they hold
-- the most blocks. Countries spread over several zones (USA, CAN, RUS, AUS)
-- are left out and stay on UTC. The next run start overwrites this with the
-- phone's own zone.
WITH ranked AS (
  SELECT owner_address, country,
    ROW_NUMBER() OVER (PARTITION BY owner_address ORDER BY COUNT(*) DESC) AS rk
  FROM hexes
  WHERE country IS NOT NULL
  GROUP BY owner_address, country
), zones(country, tz) AS (
  VALUES
    ('NGA', 'Africa/Lagos'), ('GHA', 'Africa/Accra'), ('KEN', 'Africa/Nairobi'),
    ('ZAF', 'Africa/Johannesburg'), ('UGA', 'Africa/Kampala'), ('RWA', 'Africa/Kigali'),
    ('CMR', 'Africa/Douala'), ('TZA', 'Africa/Dar_es_Salaam'), ('ETH', 'Africa/Addis_Ababa'),
    ('ZMB', 'Africa/Lusaka'), ('MWI', 'Africa/Blantyre'), ('BEN', 'Africa/Porto-Novo'),
    ('TGO', 'Africa/Lome'), ('CIV', 'Africa/Abidjan'), ('SEN', 'Africa/Dakar'),
    ('EGY', 'Africa/Cairo'), ('IND', 'Asia/Kolkata'), ('PAK', 'Asia/Karachi'),
    ('BGD', 'Asia/Dhaka'), ('IDN', 'Asia/Jakarta'), ('PHL', 'Asia/Manila'),
    ('VNM', 'Asia/Ho_Chi_Minh'), ('THA', 'Asia/Bangkok'), ('MYS', 'Asia/Kuala_Lumpur'),
    ('COL', 'America/Bogota'), ('PER', 'America/Lima'), ('ECU', 'America/Guayaquil'),
    ('VEN', 'America/Caracas'), ('ARG', 'America/Argentina/Buenos_Aires'),
    ('CHL', 'America/Santiago'), ('URY', 'America/Montevideo'),
    ('MEX', 'America/Mexico_City'), ('GTM', 'America/Guatemala'), ('BRA', 'America/Sao_Paulo'),
    ('SWE', 'Europe/Stockholm'), ('GBR', 'Europe/London'), ('DEU', 'Europe/Berlin'),
    ('ESP', 'Europe/Madrid'), ('FRA', 'Europe/Paris'), ('NLD', 'Europe/Amsterdam'),
    ('PRT', 'Europe/Lisbon'), ('TUR', 'Europe/Istanbul'), ('SRB', 'Europe/Belgrade')
)
UPDATE "users" u
SET "time_zone" = z.tz
FROM ranked r
JOIN zones z ON z.country = r.country
WHERE r.rk = 1 AND r.owner_address = u.address AND u."time_zone" IS NULL;
