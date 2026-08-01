# Changelog

All notable user-facing changes to MiniKlaim. Format loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project does not use SemVer tags today, so entries are dated instead.

## 2026-08-01

### Added

- **ERC-8021 attribution tags** on every Celo write transaction (`captureBatch`, `mintBatch`, `claimRun`, `claimBadges`, link tx, future rewards claim). Impact tracking to the Celo ecosystem starts here.
- **GPS spoof validation** (`lib/runs/validation.ts`): server-authoritative rejection of hex claims that fail accuracy (>30m), rate (>15/min), interval (<2s), or per-capture distance (>200m) checks. Whole-run reject at `/finish` for avg speed >8 m/s.
- **Fee abstraction extended to USDC and USDT** via `pickFeeAdapter`. Players with only USDT or USDC can now pay Celo gas via CIP-64 (was USDm-only).
- **Analytics endpoint expanded** (`/api/stats/analytics`) with DAU / WAU / MAU, D1/D7/D30 retention cohort averages, top 10 countries by hex count, and on-chain tx counts in 24h and 7d windows.
- **Auto-finalize orphan runs cron** closes runs stuck without `endedAt` after 6h.
- **Retry-unminted-hexes cron** re-runs `captureBatch` for runs whose hexes never made it on-chain.
- **8 new database indices** (migration 0005) on hot-path columns: `hexes.owner_address`, `hexes.run_id`, `hexes.country`, `hexes.minted_at`, `hexes.(run_id, claimed_at)`, `runs.(user_address, started_at)`, `runs.started_at`, `runs.ended_at`.
- **Celo Sepolia** (chain 11142220) added to the chain registry for testnet iteration.
- **Rewards system code** shipped dormant: `MiniKlaimRewards.sol` (UUPS, USDm vault, EIP-712 voucher claim) + backend voucher endpoint + client hook + `/me` section. All guarded by `NEXT_PUBLIC_CELO_REWARDS_ADDRESS`; UI auto-hides while unset. Activation deferred until MiniPay Stage 2 listing.

### Changed

- **Link flow (`/api/link/redeem` + `LinkExisting` + `LinkWallet`)** now uses an on-chain tx-based ownership proof instead of `useSignMessage`. Fixes a silent failure inside MiniPay (which does not support `personal_sign`). Works uniformly across MiniPay, Farcaster, Startale, and browser wallets.
- **Speed display** in the run summary and live banner switched from pace (`M:SS/km`) to `km/h`. Universal unit.
- **Wrong-network banner** copy moved to i18n (`home.cta.wrongNetwork`) so it no longer leaks the raw chain id or the word "Chain".
- **Relayer transactions** (`captureBatch`, `mintBatch`) refactored from `writeContract` to `encodeFunctionData` + `sendTransaction` to allow the ERC-8021 suffix.

### Fixed

- `hexesContract` and `badgesContract` were `null` in `/api/stats/analytics` after the legacy env-var fallback was removed. Now populated from `NEXT_PUBLIC_CELO_HEXES_ADDRESS` / `_BADGES_ADDRESS`.
- SQL `GROUP BY` bug in the retry-unminted-hexes cron script (`ORDER BY r.ended_at` required `MIN()` aggregation).

### Removed

- Legacy env var fallbacks `NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS` and `NEXT_PUBLIC_MINIKLAIM_BADGES_ADDRESS`. Use `NEXT_PUBLIC_CELO_HEXES_ADDRESS` and `NEXT_PUBLIC_CELO_BADGES_ADDRESS`.
- `lib/linkChallenge.ts` dead code (was only used by the `personal_sign` path).

## 2026-07-15

### Added

- **Persistent bottom tab bar** across all routes: You, Community, Help, Stats.

## 2026-07-14

### Changed

- **UI blockchain-jargon sweep**: single-tap sign-to-run, "You" in nav, various copy cleanups aligned with MiniPay Stage 2 rules. (Missed `Chain X` in the wrong-network banner; fixed on 2026-08-01.)

## 2026-07-07

### Added

- **Cross-wallet identity merge**: stats, runs, badges, and leaderboard aggregate across all wallets linked to the same player.
- **Pending-claim prompt**: recovers un-minted hexes from finished runs when the client dropped mid-mint.

### Fixed

- Territory map now colors hexes across every linked wallet.
- `/me` shows all territory and keeps hexes visible when zoomed out.
- Aggregate SQL queries in runs and stats fixed an array-cast that truncated totals for high-mileage users.

## 2026-06-17

### Added

- **Onboarding link flow**: explicit steps, sign-note UI, and a "create new account" branch. **Note**: this introduced a `useSignMessage` call that silently broke MiniPay linking. Fixed 2026-08-01.

## 2026-05 to 2026-06

### Added

- **Farcaster Mini App** support with signed `accountAssociation`, `farcasterMiniApp()` wagmi connector, and `sdk.actions.ready()`.
- **Soneium (chain 1868)** added as a second supported chain via Startale connector; contracts deployed and verified on Blockscout.
- **Multichain runtime wiring**: chain-aware API routes, conditional fee currency (USDm on Celo, native on Soneium at that time).
- **UUPS-upgradeable Hexes and Badges contracts** replaced the initial non-upgradeable versions.
- **Player-submitted claim flow**: `claimRun` on Hexes and `claimBadges` on Badges, gated by EIP-712 vouchers signed by the backend. Sponsored fallback via `sponsor-mint` endpoints.
- **Badge catalog** grew to 55 across 8 categories (Territory, Runs, Single-run feats, Distance, Streaks, Cities, Conquest, Countries), with hexagon medallion art and ERC-1155 metadata routes.
- **Locale switcher** (EN / ES) pinned in root layout.
- **`/stats` on-chain section** with hex counts, capture tx counts, unique holders, contract addresses linked to Celoscan.
- **Apex HTTPS**: DNS swap to Railway CNAME, Let's Encrypt cert. Both `miniklaim.fun` and `www.miniklaim.fun` serve HTTPS 200.

## 2026-05-16 (initial)

- Project scaffolded on Next.js 15, wagmi + viem, MapLibre GL, Postgres, Foundry, Celo mainnet. Territory-capture running-game MVP.

---

Historical entries before 2026-05-16 (project inception) are omitted; consult `git log --all --reverse` if you need the full pre-release history.
