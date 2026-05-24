# MiniKlaim Strategy

CEO-level strategic frame. Updated when positioning, funding, or KPIs change.

Last updated: 2026-05-22

---

## 1. North Star

> **Get 10,000 active runners claiming hexes inside MiniPay before end of Q3 2026.**

Not "users". Not "downloads". Active runners. A weekly-active runner who completes at least one run per week is the unit we optimize for.

Why that number: it is the threshold that gets MiniPay to feature the app in their Discover surface (based on observed featuring of Squadletics, Halo, Akiba Miles at similar scale). Featuring is the single biggest growth lever in MiniPay.

---

## 2. Positioning

### One sentence

MiniKlaim is the first **run-to-own** game built natively for MiniPay: every block of your city you run through becomes a verifiable on-chain asset, free to play, no token required.

### Vs. STEPN / Sweatcoin / Stepn-likes

| Axis | STEPN-class | MiniKlaim |
|------|-------------|-----------|
| Entry cost | Sneaker NFT ($300+) | Free |
| Token | Yes, inflationary | None (NFTs only) |
| Mechanic | Steps -> tokens | Geographic hexes -> ownership |
| Target market | Crypto-native global | MiniPay emerging markets (NG/KE/ZA/CO/AR) |
| Network effect | None per location | Strong per city (your neighborhood, your friends) |
| Regulatory risk | High (token = security?) | Low (free utility NFTs) |

The wedge: **free** + **local network effect** + **MiniPay-native**. No competitor in the MiniPay catalog matches all three.

### Vs. the only direct competitor on MiniPay

**Squadletics** ("Earn while you exercise"). Single competitor in `health-fitness` category. Their model is reward-points-for-activity, no spatial mechanic. We win on retention because hexes you own are sticky in a way that points are not - someone can take them from you, which creates return visits.

---

## 3. Market

### TAM

- MiniPay: 14M+ wallets, 300M+ stablecoin txs lifetime, 60+ countries.
- MiniPay heavy markets: Nigeria, Kenya, Ghana, South Africa, Uganda, Colombia, Argentina.
- Smartphone + GPS + walking/running is universal. The activity itself is not gated by income, fitness gear, or class.

### Beachhead

**Colombia** first. Three reasons:
1. Founder is local. Native Spanish copy, local community, can show up in person.
2. MiniPay is growing in LATAM. Less saturated than Nigeria/Kenya.
3. City density (Bogota, Medellin) makes hex collisions interesting fast.

Expansion order after Colombia validates:
- Argentina (similar urban density + crypto adoption)
- Mexico (volume + USD diaspora flows)
- Africa (NG -> KE -> ZA) once we have evidence retention works cross-country

### Wedge by demographic

| Segment | Why they play | Hook |
|---------|---------------|------|
| Casual runners (existing) | Gamification of what they already do | "Strava but you own the streets" |
| Cost-conscious fitness | Free, no app fees, no gym | "Run for fun, collect blocks" |
| Crypto-curious | First non-financial reason to use MiniPay | "Try crypto without buying crypto" |
| Local pride / neighborhood | Owning your block | "Be the mayor of your barrio" |

---

## 4. Business model

### Phase 1 - Free, no monetization (now -> +6 months)

Goal is retention and word-of-mouth. Monetization is friction; we have zero. NFT mints are sponsored by the project wallet (server-paid gas, ~$0.0005 per mint, trivial).

### Phase 2 - Optional season pass (+6 to +12 months)

USDT or USDm season pass, ~$1/month. Unlocks:
- Premium hex colors / skins
- Hex-level statistics (who passed, when)
- Defense bonus (harder for someone to retake your hex)
- Early access to event windows

Floor target: 2% of WAU buys the pass. At 10K WAU = 200 passes = $200/month gross. Not the play. The pass is a signal of intent and feeds the retention loop.

### Phase 3 - City sponsorships (+12 months)

Local brands (gyms, sneaker shops, juice bars, banks) sponsor specific hexes or city events. Sponsor pays USDT on-chain, gets:
- Branded hex on the map (subtle, opt-in to view)
- Their logo on the city leaderboard
- "Sponsored by" on city events ("Invasion del Sabado en Bogota brought to you by X")

Floor target: $500/month from 2 sponsors in beachhead city by month 14.

### Phase 4 - Tradeable hex marketplace (TBD)

Only after we are sure of the regulatory shape. Hexes become transferable (currently protocol-only). Marketplace takes 2.5% fee. Risky territory legally - park indefinitely.

---

## 5. Growth engine

### Loop 1: Geographic virality (strongest)

Player A runs through Player B's neighborhood. Player B's hex gets contested. Player B opens the app to see what happened, sees their hex was taken. Their next run is to get it back.

**Why it works:** ownership creates a defending behavior that competing platforms (Strava, Sweatcoin) do not have. Steps are not threatened. Blocks are.

**Lever:** push notifications when your hex is contested. Currently not built (PWA limitation; revisit when MiniPay adds web push).

### Loop 2: Social share (already built)

Every player has `/p/[username]` with a dynamic OG image. Sharing on WhatsApp/Telegram drops a card with city stats. Tap -> land on the runner's public page -> see the map -> "I want one too".

**Lever:** make the OG image more shareable. Add the runner's city silhouette + their hex count over a 1-week period. Currently shows username + total hex count only.

### Loop 3: Local leaderboard FOMO

Per-city leaderboard not yet built (only global). When 50+ runners join a city, a city-scoped board becomes interesting. Top 10 per city is achievable for a casual runner; top 10 global is not.

**Lever:** auto-promote per-city leaderboards on the `/community` page once each city crosses 50 players.

### Loop 4: Achievement badges (existing, on-chain WIP)

10 badges in UI today. Once badges are minted as ERC-1155 soulbound NFTs (contract WIP), they become bragging rights on a profile that can be shared outside the app (X, Farcaster).

---

## 6. KPIs

Tracked on `/stats` (public). Targets are 90-day milestones from PoS submission (May 29 -> Aug 27).

| Metric | Today | 30 days | 90 days | Source |
|--------|-------|---------|---------|--------|
| Total registered runners | ~10 (testers) | 100 | 1,000 | DB |
| WAU | ~5 | 50 | 500 | DB |
| D1 retention | unknown | 30% | 40% | DB cohort query |
| D7 retention | unknown | 15% | 25% | DB cohort query |
| Hexes claimed lifetime | hundreds | 10K | 100K | DB / contract |
| On-chain captures (mainnet) | 0 | 1K | 50K | Celoscan |
| Failed-tx rate (mint queue) | n/a | <2% | <1% | Queue table |
| PageSpeed (mobile, prod) | unknown | 85+ | 90+ | pagespeed.web.dev |
| MiniPay listed | no | submitted | listed | MiniPay |

D1/D7/D30 cohort retention is **required** by the MiniPay listing checklist. Today there is no such query. **Action: implement before Stage 1 submission.**

---

## 7. Funding

Funding programs ranked by fit and timing.

### Active / actionable now

1. **Celo Proof of Ship - May 29, 2026 deadline ($5K pool, 50 winners)**
   - Eligibility: ship something on Celo mainnet this month. Done (HexNFT live).
   - Probability: medium-high if Badges contract also lands. Submit even if partial.

2. **Celo Public Goods quarterly (CeloPG)**
   - Verify live status at `https://celopg.eco/programs` before applying.
   - MiniKlaim qualifies as public infrastructure (community gamification + free run tracking).
   - Ask: $5K-$20K to fund 6 months of growth experiments.

3. **Mento Labs partnership**
   - USDm integration angle: when season pass launches in Phase 2, use USDm. Apply for co-marketing + small grant (~$5K).
   - Direct outreach via Mento forum.

### Watchlist / longer arc

4. **MiniPay Ecosystem grant / featuring** - typically post-listing. Listing is the prerequisite. Push hard on Stage 1 -> Stage 2 listing first.
5. **Talent Protocol builder grants** - on-chain reputation. Founder already has talent.app profile. Add MiniKlaim, link GitHub, accumulate reputation passively.
6. **Aragon / civic DAO grants** - urban gamification fits Aragon's civic narrative. Long shot but free to apply.
7. **Farcaster / Frames hackathons** - port a thin "claim your block" frame as a marketing surface, win small bounties.

---

## 8. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GPS spoofing / bot farms gaming hex captures | High | High | Server-side validation: distance covered must match elapsed time within reasonable bounds. Rate-limit hexes per minute. Add `accuracy` filter on GPS samples (reject samples with >30m horizontal accuracy). |
| MiniPay rejects listing on quality / UX bar | Medium | High | Stage 1 prep checklist (see `MINIPAY-LISTING.md`). Do not submit until all green. |
| Battery drain on long runs alienates users | Medium | Medium | Reduce GPS sample rate when stationary. Document expected battery impact in `/about`. |
| Liability for running injuries | Low | Medium | ToS already has a fitness-disclaimer-style clause. Reinforce: "Run safely. Watch traffic. MiniKlaim is not a fitness coach." |
| Smart contract bug (transfer logic, mint queue) | Low | High | 10/10 forge tests on HexNFT. Add forge tests for Badges before deploy. Eventually: pashov-style 8-agent audit, or apply for a Celo security grant. |
| MiniPay platform deprecates or changes auth | Low | Critical | Keep wagmi/viem-only stack. Avoid MiniPay-specific SDK lock-in. Already done. |
| Founder bandwidth (solo project) | High | Medium | Strict scope: PoS -> listing -> 1000 WAU. Defer everything else. AI support agent on Telegram to absorb support load (recommended by MiniPay anyway). |

---

## 9. Operating principles

1. **MiniPay first, web wallet second.** Every decision optimizes for the MiniPay user. Desktop is a fallback.
2. **Free until 1K WAU.** Monetization is friction. We have zero engagement; do not add tax.
3. **On-chain when meaningful.** Hexes and badges are on-chain because ownership matters. Activity logs and chat are off-chain because they do not.
4. **DB is source of truth for UX. Chain is the durable mirror.** Real-time hex updates come from Postgres. Chain settles asynchronously in batches. This keeps gameplay responsive and gas costs bounded.
5. **Sponsored gas always.** Players never sign a transaction. Server signer pays. Celo gas is ~$0.0005 per mint; the entire game costs less to run than the database.
6. **No emails, no signups, no KYC.** Wallet address + optional username. Phone identity via ODIS later if MiniPay demand it.
7. **Bilingual EN/ES from day one.** Already shipped. Add PT for Brazil expansion (Phase 2).

---

## 10. Decision log (strategic)

| Date | Decision | Why | Reversibility |
|------|----------|-----|---------------|
| 2026-05-21 | Pivot roadmap to Celo PoS (hexes + badges) | $5K is non-dilutive, deadline is forcing function | High |
| 2026-05-22 | Hex NFT deployed to Celo mainnet (not Alfajores) | PoS requires mainnet | Low (contracts immutable) |
| 2026-05-22 | Hex transfers disabled (`TransfersDisabled` revert) | Prevents arbitrary trading; protocol moves ownership | High (admin can deploy v2) |
| TBD | Beachhead = Colombia | Founder ground game + LATAM MiniPay growth | High |
| TBD | Season pass = USDT or USDm | TBD pending Mento conversation | High |

---

## 11. What "winning" looks like, by quarter

- **Q2 2026 (now -> Jun 30):** PoS prize, MiniPay Stage 1 intake submitted, 100 runners.
- **Q3 2026 (Jul -> Sep):** MiniPay Stage 2 listing live, 1,000 runners, retention D7 > 25%.
- **Q4 2026 (Oct -> Dec):** 5,000 runners, featured by MiniPay at least once, season pass v0 in beta.
- **Q1 2027 (Jan -> Mar):** 10,000 runners, first city sponsorship live in beachhead, Phase 2 monetization at $500 MRR floor.

If we hit those, MiniKlaim is the first proven non-financial MiniPay app at scale, which sets up a Series A or a more ambitious Celo PoG grant for v2.
