# MiniKlaim Roadmap

Living document. Update as we ship. Reorder when priorities change.

Last updated: 2026-05-21

---

## Goal

**Win on Celo Proof of Ship (deadline May 29, 2026).** $5,000 pool, 50 winners.

Requirements:

1. MiniPay integration - **already done**.
2. Smart contract on Celo mainnet - **building now**.
3. Submission to the campaign - **last step**.

---

## Strategy

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

## 8-day timeline

### Day 1-2 - HexNFT contract

- `contracts/` dir, Foundry init, OpenZeppelin imports
- `MiniKlaimHexes.sol`: ERC-721, role-gated mint + transfer, `_beforeTokenTransfer` blocks player transfers
- Forge tests: mint, transfer-by-role, transfer-by-player reverts
- Deploy to Celo mainnet via Foundry script
- Verify on Celoscan
- Server signer wallet created, private key in Railway env, fund with a bit of CELO + USDm

### Day 3 - Wire backend to HexNFT

- `lib/onchain/hexes.ts` with viem + ABI
- `/api/runs/[id]/finish` calls `claimBatch(player, h3Ids[])` for the run's hexes
- Retry queue (Postgres table) for any failed tx; cron tries again
- New schema column on `hexes`: `minted_at timestamptz nullable`

### Day 4 - Badges contract + UI

- `MiniKlaimBadges.sol` ERC-1155 soulbound, deploy + verify
- /me: each hex card gets a Celoscan link when minted; badge card shows on-chain status
- /p/[username]: "X hexes on-chain" stat
- Forge tests

### Day 5 - Badge lifecycle

- Server evaluates thresholds after run finish; mints any newly-unlocked badges
- First Hex badge mints in same finish-run tx
- Cron for monthly leaderboard snapshot + Top of Month mint

### Day 6 - Production cutover

- Merge `dev` -> `main`, push (you authorize)
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

## Out of scope until after PoS

These come back to the table once PoS submission is in:

- Friend / follow system
- Tradeable hex marketplace (currently transfer-by-protocol-only by design)
- Mobile native wrappers
- Multiplayer territory battles

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
- Roadmap to PoS: this document.
