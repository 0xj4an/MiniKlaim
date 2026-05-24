# MiniKlaim Improvements Backlog

Prioritized list of everything we know we should do, scoped to "after Celo PoS is submitted" (post May 29). Ordered roughly by impact-over-effort.

Last updated: 2026-05-22.

---

## Priority tiers

- **P0** - blocks MiniPay Stage 1 intake. Ship in the next 1-2 weeks.
- **P1** - blocks MiniPay Stage 2 listing or fixes a real production risk. Ship in 3-6 weeks.
- **P2** - growth, retention, polish. Ship in 6-12 weeks once P0/P1 cleared.
- **P3** - long-arc / explore. No fixed date.

---

## P0 - MiniPay Stage 1 blockers

### P0.1 - Fix two "crypto wallet" copy violations

**Files:** `lib/i18nDict.ts:22`, `:27`
**Fix:** replace "crypto wallet" with "wallet" or "MiniPay wallet" in both `home.env.telegram.body` and `home.env.noWallet.body` (EN + ES variants).
**Effort:** 5 min.

### P0.2 - Capture PageSpeed Insights baseline

**Action:** run `https://pagespeed.web.dev/analysis?url=https://miniklaim.fun` on mobile profile. Screenshot. Save to `tasks/screenshots/pagespeed-baseline.png`. If score < 85, fix the top 3 regressions before submission.
**Effort:** 30 min baseline; up to 1 day if score is bad.

### P0.3 - 360 x 640 manual rehearsal

**Action:** Chrome DevTools mobile mode (iPhone SE) + real Android device. Walk through onboarding, run, finish, /me, /community, /stats. Note any layout shifts or unreachable buttons.
**Effort:** 1 hour.

### P0.4 - Screenshots pack

**Action:** capture 4 screenshots in 360x640: home, /run in progress with map, /me with hexes + (mocked) badges, /community world map. PNG < 500 KB each. Save to `tasks/screenshots/`.
**Effort:** 30 min.

### P0.5 - Social presence

**Action:** create `@miniklaim` on X (or `@miniklaim_app` if taken). First thread: gif of the run, screenshot of the map, link. Cross-post on Farcaster. Link from `/about` footer.
**Effort:** 1 hour.

### P0.6 - In-app support link

**Action:** create `https://t.me/miniklaim_support` (private chat the founder owns, accept all join requests). Add link to `/about` footer + nav.
**Effort:** 30 min.

### P0.7 - Sample tx hashes

**Action:** after Day 3-5 of roadmap (backend wired), capture sample tx URLs for `capture` (mint), `captureBatch`, `setBaseURI`, and (once Badges deployed) `mintBadge`, `mintBatchBadges`. Save to `tasks/MINIPAY-LISTING.md` under Stage 2 §5.
**Effort:** included in roadmap days.

---

## P1 - Production risks and Stage 2 prep

### P1.1 - GPS spoof guards

**Risk:** without these, bot farms in low-cost markets game the leaderboard and on-chain captures. Existential to game integrity.

**Add:**
- Reject GPS samples with `coords.accuracy > 30m` (client + server check).
- Reject samples where `distance / elapsed > 10 m/s` (faster than world-class sprint).
- Reject runs where average pace > 25 km/h (cars).
- Rate-limit hex captures: max 10 per minute per user (a 5 km/h jog through resolution-12 hexes yields ~6 per minute; 10 is a generous ceiling).
- Optional: store first-3-samples accelerometer fingerprint as a weak liveness signal.

**Effort:** 1-2 days for the first 4. Accelerometer is exploratory.

### P1.2 - Mint queue with retry

**Files (new):** `lib/db/schema.ts` (`mint_queue` table), `lib/onchain/hexes.ts`, `app/api/runs/[id]/finish/route.ts`, `scripts/process-mint-queue.ts` (cron).

**Behavior:** on run finish, insert one row per hex into `mint_queue` with `status='pending'`. A worker drains in batches of 20 via `captureBatch`. On RPC error, mark `status='failed'`, increment `attempts`, exponential backoff. Surface `failed-tx rate` on /stats.

**Effort:** 2 days.

### P1.3 - Analytics for MiniPay listing

**File:** `app/api/stats/analytics/route.ts` (extend), `app/stats/page.tsx` (new sections).

**Add to API:**
- `dau` - distinct addresses with a run in last 24h
- `wau` - last 7d
- `mau` - last 30d
- `retention.d1`, `retention.d7`, `retention.d30` (cohort SQL)
- `topCountries[]` (requires edge IP geo)
- `onchainTxs24h`, `onchainTxs7d`, `onchainTxsLifetime`, `failedTxRate7d`
- `uniqueOnchainUsers30d`

**SQL sketch for D7 retention:**
```sql
WITH cohort AS (
  SELECT user_address, DATE_TRUNC('day', MIN(started_at)) AS cohort_day
  FROM runs GROUP BY user_address
)
SELECT cohort_day,
       COUNT(DISTINCT cohort.user_address) FILTER (
         WHERE EXISTS (SELECT 1 FROM runs r
                       WHERE r.user_address = cohort.user_address
                       AND r.started_at::date = cohort_day + 7)
       )::float / NULLIF(COUNT(DISTINCT cohort.user_address), 0) AS d7_retention
FROM cohort
WHERE cohort_day >= NOW() - INTERVAL '60 days'
GROUP BY cohort_day
ORDER BY cohort_day DESC;
```

**Effort:** 2-3 days including UI.

### P1.4 - URL/subdomain manifest

**Action:** record every external origin the app hits. Submit with MiniPay Stage 2.
**Suspects:** `miniklaim.fun`, `forno.celo.org`, `api.celoscan.io`, MapLibre tile origin, Railway internals.
**How:** run the app with browser DevTools Network tab and `Cmd+E` to filter only third-party. Document in `tasks/MINIPAY-LISTING.md` §4.
**Effort:** 1 hour.

### P1.5 - Auto-finalize orphan runs

**Cron (daily 02:00 UTC):** any run with `ended_at IS NULL` and `started_at < now() - interval '24 hours'` -> set `ended_at = started_at + interval '1 hour'`, mark synthetic finish.
**Effort:** 1 hour.

### P1.6 - Badge contract + lifecycle

Already on the roadmap (Day 4-5). Listing as P1 here because it's a Stage 2 listing dependency. Spec: `tasks/TECH-SPEC.md` §2.2.

### P1.7 - PostGIS spatial index

**SQL:** `CREATE INDEX hexes_geom_idx ON hexes USING GIST (h3_to_geometry(h3_id));` (or store a `geom` column for indexing).
Required before world-map query starts dragging at ~100K hexes.
**Effort:** 1 day including migration.

---

## P2 - Growth and retention

### P2.1 - Per-city leaderboards

Auto-promote on `/community` once a city crosses 50 players. Currently global only. City detection via H3 -> nearest city centroid lookup (we already seed 64 cities).
**Effort:** 2 days.

### P2.2 - "Your hex was contested" UX

Notify users (in-app first, push later when MiniPay supports it) when a hex they own changes owner. Currently silent.
**Effort:** 2 days for in-app banner; push is blocked on MiniPay platform.

### P2.3 - Daily streak bonus

7-day streak -> special "Streak Master" badge mint. 30-day streak -> sponsored hex placement somewhere meaningful (their home block?).
**Effort:** 1 day on top of badge lifecycle (P1.6).

### P2.4 - Richer OG image

Currently shows username + total hex count. Add: city silhouette, 7-day hex change delta (+12 / -3), week rank.
**Effort:** 1 day.

### P2.5 - PT-BR localization

Mirror EN/ES. Critical once we touch Brazil. Likely after we validate Colombia/Argentina.
**Effort:** 1-2 days for translation + QA.

### P2.6 - World map performance pass

Lazy-load city geometries as the user pans/zooms. Currently loads all 64 cities up front.
**Effort:** 1 day.

### P2.7 - AI support agent on Telegram

Recommended by MiniPay requirements §6. Pattern:
- Webhook receives `/start` and DM messages.
- Claude API call with prompt caching on the FAQ + last 10 tickets.
- Categorize as bug / UX / payment / KYC / feature; criticality P0-P3.
- Draft a response; queue for human approval (or auto-send for P3 questions).
- Track in a `support_tickets` table.

**Why:** MiniPay 24h SLA on critical fixes is hard solo. This makes it tractable.
**Effort:** 3-5 days for v1.

### P2.8 - Season pass v0

USDT or USDm, $1/month. Unlocks premium hex skins + hex-level stats. Use `minipay-templates.md` Preferred Stablecoin Selection (auto-pick the user's highest-balance stablecoin between USDT/USDC/USDm).

**Critical UI copy:** "Network fee", "Deposit", "Withdraw", "Stablecoin" - never gas/crypto/onramp.

**Effort:** 1 week including contract + UI + Mento conversation.

### P2.9 - Server signer key in KMS

Currently a hot key on Railway env vars. Migrate to a KMS / HSM / threshold-signed service.
**Effort:** 1-2 days.

---

## P3 - Long-arc explorations

### P3.1 - Tradeable hex marketplace

After regulatory shape is clear. Hexes become transferable under explicit user consent. 2.5% protocol fee.
**Effort:** weeks. Park indefinitely.

### P3.2 - Multiplayer / clans

Per-team city domination. Could become event-window only.
**Effort:** weeks.

### P3.3 - Daily Merkle root anchor on Celo

Anchor a Merkle root of the day's runs on-chain for a tamper-evident log. Useful for trust at scale, premature now.
**Effort:** 1 week.

### P3.4 - Farcaster Frame

A "claim your block" frame that lets a user, from inside Warpcast, claim a single hex around their geolocation per day. Marketing surface.
**Effort:** 3-5 days.

### P3.5 - Native mobile wrapper (Capacitor or Expo)

Better GPS background tracking than browser. Real push notifications. Probably overkill until 5K+ WAU.
**Effort:** 2-3 weeks.

### P3.6 - $RUN token

Only if regulatory analysis says we can. Mentioned in original v4 roadmap, currently archived.

### P3.7 - Audit (pashov-style or Celo security grant)

Once Badges is live and total NFT supply > 10K, pursue an external audit.
**Effort:** money, not time. ~$10K market rate.

---

## How to use this file

1. **At the start of every planning session:** read top to bottom, pick the next P0/P1 item.
2. **When a new idea lands:** add it under the right priority. Do not move existing items unless evidence changed.
3. **When something ships:** delete the item (or move to `JOURNAL.md` if it taught us something).
4. **On scope cuts:** be honest. Move work from P1 -> P2 if we cannot get to it in 6 weeks. Better to have a realistic P1.
