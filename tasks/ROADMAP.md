# MiniKlaim Roadmap

Living document. Update as we ship. Reorder when priorities change.

Companion docs:

- [STRATEGY.md](STRATEGY.md) - positioning, GTM, KPIs
- [MINIPAY-LISTING.md](MINIPAY-LISTING.md) - listing gap analysis
- [TECH-SPEC.md](TECH-SPEC.md) - architecture and contracts
- [IMPROVEMENTS.md](IMPROVEMENTS.md) - prioritized backlog post-PoS

Last updated: 2026-05-22

---

## North Star

> **Get 10,000 active runners claiming hexes inside MiniPay before end of Q3 2026.**

See [STRATEGY.md §1](STRATEGY.md) for why this number and how it maps to MiniPay featuring.

---

## Active milestones

### Milestone 1 - Celo Proof of Ship (deadline 2026-05-29)

$5,000 pool, 50 winners.

Requirements:

1. MiniPay integration - **done**
2. Smart contract on Celo mainnet - **HexNFT done; Badges in progress**
3. Submission to the campaign - **last step**

### Milestone 2 - MiniPay Stage 1 intake (target 2026-06-13)

Submit at [minipay.to/mini-apps](https://minipay.to/mini-apps). Triage on quality - we only get one good first impression. Do not submit until every Stage 1 blocker in [MINIPAY-LISTING.md](MINIPAY-LISTING.md) is green.

### Milestone 3 - MiniPay Stage 2 listing (post first call)

Full readiness form. Quietly the bigger arc: covers analytics, support SLA, and the URL manifest. Tracked in [MINIPAY-LISTING.md](MINIPAY-LISTING.md) §2.

### Milestone 4 - 1,000 weekly active runners

90-day target from PoS submission (May 29 -> Aug 27).

---

## Strategy summary

Two contracts on Celo mainnet that turn the existing gameplay into real on-chain assets:

### `MiniKlaimHexes` - ERC-721, the game mechanic

- 1 NFT per captured H3 hex. `tokenId = uint256(h3Index)`.
- Transferable only by the contract (not by the player). When a player captures someone else's hex, the contract transfers ownership.
- DB stays source of truth for real-time UX. Chain is a mirror. Server batches mints/transfers at run finish.
- `tokenURI` returns lat/lng of the hex centroid so it looks meaningful on Celoscan / wallets.

### `MiniKlaimBadges` - ERC-1155 soulbound, the achievements

- 1 tokenId per badge type. Non-transferable.
- Catalog:
  - The 10 we already have in UI (First steps, Five blocks, Mayor, Hundred, etc.)
  - First Hex (your first ever capture; minted in the same tx as the first hex NFT)
  - Top of Month (monthly snapshot job picks the leader)

### Sponsored gas

Server-mints. Project wallet has MINTER + TRANSFERRER roles. Player never signs anything except their normal MiniPay session. Celo gas is ~$0.0005 per mint; cost is trivial.

---

## 8-day timeline (PoS sprint)

### Day 1-2 - HexNFT contract DONE

- `contracts/` dir, Foundry init, OpenZeppelin imports
- `MiniKlaimHexes.sol`: ERC-721, role-gated mint + transfer, `_beforeTokenTransfer` blocks player transfers
- Forge tests: 10/10 passing
- **Deployed to Celo mainnet: `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47`** (2026-05-22)
- **Verified on Celoscan via Etherscan v2 unified API** (2026-05-22, commit `a458891`)
- Server signer: `0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83` (funded with 1 CELO)

### Day 3 - Wire backend to HexNFT

- `lib/onchain/hexes.ts` with viem + ABI
- `/api/runs/[id]/finish` calls `captureBatch(player, h3Ids[])` for the run's hexes
- `mint_queue` Postgres table for any failed tx; cron retries with exponential backoff
- New schema column on `hexes`: `minted_at timestamptz nullable`
- Capture sample tx hashes for `capture` (first-mint case) and `captureBatch` (steal case)

### Day 4 - Badges contract + UI

- `MiniKlaimBadges.sol` ERC-1155 soulbound, deploy + verify
- `/me`: each hex card gets a Celoscan link when minted; badge card shows on-chain status
- `/p/[username]`: "X hexes on-chain" stat
- Forge tests for Badges

### Day 5 - Badge lifecycle

- Server evaluates thresholds after run finish; mints any newly-unlocked badges
- First Hex badge mints in same finish-run tx
- Cron for monthly leaderboard snapshot + Top of Month mint

### Day 6 - Production cutover

- Merge `dev` -> `main`, push (founder authorizes)
- Railway prod redeploys with contract envs wired
- Add `miniklaim.fun` (apex) custom domain in Railway + Namecheap DNS
- Both `miniklaim.fun` and `www.miniklaim.fun` serving the real app

### Day 7 - PoS submission

- Fill the campaign form
- Screenshots: home, /run with NFT capture in progress, /me with minted badge + hex links, /community world map
- Both contract addresses linked
- Update talent.app profile: add MiniKlaim as a project, connect GitHub (last 90 days of commits already counts)

### Day 8 - Buffer

Anything that broke. Final pass through tester feedback.

---

## Post-PoS phases

### Phase A (2026-06-01 -> 06-13) - Stage 1 intake prep

Block list lives in [MINIPAY-LISTING.md](MINIPAY-LISTING.md) §Stage 1 blocker list. Highlights:

- Fix two "crypto wallet" copy violations in `lib/i18nDict.ts` (P0.1 in IMPROVEMENTS.md)
- Capture PageSpeed Insights baseline; fix worst regressions if score < 85
- 360 x 640 manual rehearsal (Chrome DevTools + real phone)
- Capture 4 screenshots in 360 x 640
- Create `@miniklaim` on X and Farcaster
- Stand up Telegram support channel
- Capture sample tx hashes

Submit Stage 1 intake at `https://minipay.to/mini-apps`.

### Phase B (2026-06-14 -> 07-14) - Stage 2 readiness + production hardening

Block list in [IMPROVEMENTS.md](IMPROVEMENTS.md) §P1. Highlights:

- GPS spoof guards (P1.1)
- Mint queue with retry + failed-tx rate visibility (P1.2)
- Analytics overhaul on `/stats`: DAU/MAU, D1/D7/D30 retention, top countries, on-chain tx metrics (P1.3)
- URL/subdomain manifest (P1.4)
- Auto-finalize orphan runs (P1.5)
- PostGIS spatial index on hexes (P1.7)

Goal: have all Stage 2 checklist items green before the MiniPay first call.

### Phase C (2026-07-15 -> 09-30) - Growth and retention to 1K WAU

Block list in [IMPROVEMENTS.md](IMPROVEMENTS.md) §P2. Highlights:

- Per-city leaderboards (P2.1)
- "Your hex was contested" UX (P2.2)
- Daily streak bonus (P2.3)
- Richer OG image (P2.4)
- PT-BR localization (P2.5)
- AI support agent on Telegram (P2.7) - meets MiniPay 24h SLA at scale

Goal: 1,000 weekly active runners, D7 retention > 25%, MiniPay listed.

### Phase D (2026-10 -> 12) - Monetization v0

Season pass via USDT or USDm, $1/month. Unlocks premium hex skins + hex-level stats. Triggers Mento Labs conversation. Detail in [STRATEGY.md §4 Phase 2](STRATEGY.md).

---

## Out of scope until after listing

These come back to the table once Stage 2 listing is live:

- Friend / follow system
- Tradeable hex marketplace (currently transfer-by-protocol-only by design)
- Mobile native wrappers (Capacitor / Expo)
- Multiplayer territory battles
- $RUN token economy (parked indefinitely pending regulatory clarity)

---

## Tester reports

Track recurring issues here so patterns stay visible across sessions.

### 2026-05-21 - Telegram tester

- "Sign in to play" did nothing inside Telegram in-app browser. **Fixed paso 70** (env detection -> shows "Open in your browser" with Copy-link).
- "Internal error" when saving username. **Fixed paso 70** (API now surfaces the real DB error). **Fixed paso 71** (form submits on Enter, clears error on edit, lowercase keyboard).
- Auto-switch to Celo instead of asking. **Fixed paso 70** (auto-fires switchChain on detection).

### 2026-05-21 - "Smoothly built" reviewer

- "Tap Start running on the home page" ambiguous. **Fixed paso 72** (rephrased to "From the home screen, tap Start running.").
- "Your money" feels disconnected from running. **Fixed paso 72** (renamed to "Wallet" with subtitle "Rewards and badges coming soon"). User confirms: keep wallet visible, plan to integrate rewards later - which is exactly what hex NFTs + badges do.
- "Will there be financial incentive?" - Yes. Hex NFTs + badges, deploying this week.

---

## Done shipping

High-level milestones. For per-paso detail see `JOURNAL.md`.

- Core gameplay: GPS run tracking, H3-12 hex claiming, real-time map.
- MiniPay integration: auto-connect, fee abstraction, supported tokens only.
- Profile: username system, public `/p/[username]`, joined date, badges (10).
- Social: clickable usernames everywhere, share via Web Share API, dynamic OG image per profile.
- Community: leaderboard, activity feed, world map with city dots + hex polygons (64-city seed).
- Stats: public `/stats`, personal `/me` with stats, streak, achievements, territory map, wallet.
- i18n: full EN/ES coverage including server-rendered routes and OG image.
- Perf: maplibre deferred off home critical path, CLS reserved, route error / 404 boundaries.
- Legal: Privacy + Terms pages with bilingual copy.
- PWA: manifest, icons (192, 512, apple-touch), viewport meta.
- Help: `/about` with how-to and FAQ.
- Tester polish: paso 70 (3 blockers), paso 71 (form UX), paso 72 (copy + wallet rename).
- HexNFT contract: deployed and verified on Celo mainnet 2026-05-22.
- Strategic documentation refresh: STRATEGY, MINIPAY-LISTING, TECH-SPEC, IMPROVEMENTS (2026-05-22).
