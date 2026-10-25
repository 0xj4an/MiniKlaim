# Changelog

All notable user-facing changes to MiniKlaim. Format loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project does not use SemVer tags today, so entries are dated instead.

## 2026-10-25

### Fixed

- **Streak days end at the player's local midnight, not UTC.** A run at 8 pm in Mexico was dated the next day in UTC, which left a hole and reset real streaks (erikvalle played 19–24 Oct every day and was shown a 1-day streak). The run start now sends the phone's time zone, saved on the player as `users.time_zone`; streak days and "today" are taken in that zone. Players who have not started a run since are given the main zone of the country where they hold most blocks (countries with several zones, like the USA, stay on UTC until their next run). In the top 100 this restores erikvalle's 6-day streak and the best streak, and so the streak badges, of rushdee, pae, noelgray and korex.
- **Walking your own blocks keeps the streak.** Since 23 Oct only runs with a new block counted, so a player covering territory they already own lost the day (bagwell rode 689 m on 24 Oct, pushin_p walked 1.5 km on 18 Oct, both without a new block). A finished run now also counts when the server measured at least 200 m along its hex path. Runs opened and closed without moving still do not count.
- **The public profile shows the same streak as /me.** The profile and badge checks used a single wallet, /me used every linked wallet; all three now use the linked wallets.

## 2026-10-23

### Fixed

- **Errors that only reached PostHog now reach Sentry too.** Crashes caught by the app's error boundary (337 `app_crash` events, 81 people, to 23 Oct) never reached Sentry, because React catches them before Sentry's global handlers. The boundary now reports them, and a WebGL failure that crashed the page (117 events on /run and /community) is kept as one `webgl-crash` issue instead of being dropped as map noise. Map WebGL failures handled with a notice, and 5xx responses the run screen gets from `/api/hexes` and `/api/runs/:id/claim` (~40 504s in 3 days), are reported as warnings grouped by endpoint and status, at most 3 per kind per page session.
- **PostHog no longer creates a new person on every page load.** wagmi starts each load as "reconnecting", and the analytics provider reset the identity on that first render, so every visit began as a new anonymous person (~14k people counted against ~8k players). The identity is now reset only when a wallet identified in that session disconnects, a repeat identify for the same wallet only refreshes person properties, and the player's username is attached to their person.
- **/community no longer crashes on phones without WebGL.** The world map's constructor threw into the error page (31 crashes from 14 players up to 23 Oct); it now shows a note instead of the map and skips the world download. On /run a run already tracked without the map; the notice now says the run still records instead of "runs can't start".
- **Streaks count only days with a captured block.** A run closed without capturing anything used to keep a streak alive, so streak badges could be farmed by opening and closing a run each day: 20 of the 80 wallets holding the 3-day badge got it with empty days, and 5 never captured a block. Badges already minted stay.
- **Streak badges no longer get lost.** They were granted only from the *current* streak at claim time, so a player who reached 3 or 7 days but did not claim while the streak was alive never got the badge (19 wallets). Eligibility now uses the best streak ever; they get it on their next claim.

### Changed

- **Stats and leaderboard queries are ~5x faster.** The rank in `/api/users/:address/stats` looked up `player_wallets` once per joined hex row (~230k rows per call, about 2 billion index scans so far) and took ~1.5 s; hexes are now counted per address first (~0.3 s, same ranks). The leaderboard gets the same change (1.5 s to 0.2 s, identical top 20). This runs on every /me visit and every run summary, and is a likely source of the 504s.
- **Location is explained before the phone asks for it.** On a device that never had a GPS fix, /run first shows a short sheet: why the game needs location, that only the blocks captured during a run are saved, and what to choose in the prompt. Its button fires the permission request (keeping the user gesture MiniPay iOS needs); GPS tracking waits until then. 729 people had denied location cold, and in MiniPay a denial can only be undone from the phone settings. Events `gps_prompt_shown` and `gps_prompt_accepted`.
- **Blocked location has a way back.** The blocked and timed-out banners now carry a "Try again" button (event `gps_retry`), and the blocked text also covers iPhone.

### Fixed

- **/community no longer crashes on phones without WebGL.** The world map's constructor threw into the error page (31 crashes from 14 players up to 23 Oct); it now shows a note instead of the map and skips the world download. On /run a run already tracked without the map; the notice now says the run still records instead of "runs can't start".

### Changed

- **Fee copy is accurate.** The FAQ, wallet card, terms and NFT section no longer say runs are saved "for free" or just "MiniKlaim doesn't charge". They now say playing is free, saving a run uses a small network fee from the player's wallet (usually under $0.01, more for very long runs), and MiniKlaim pays it when the player can't. EN and ES.
- **Unsettled blocks are settled automatically.** The 4-hourly `cron-retry-unminted` now also settles hexes of runs that ended more than a day ago and are still not on-chain (sponsor-capped or never claimed), up to 20,000 per pass, with the Celo attribution tag. On 23 Oct 9,724 blocks had piled up this way and were settled by hand. Declined runs are left alone. The logic moved to `lib/onchain/settleBacklog.ts`; `npm run runs:settle-backlog` uses it too.
- **World map download is 6x smaller.** `/api/hexes` without `near` returned every claimed hex as a flat row (about 24 MB of JSON at 230k hexes, repeating the owner on each row). The app now asks for `?fmt=owners`, grouped by owner (about 4 MB, 0.8 MB gzipped). Parsing the flat list was the likely cause of out-of-memory crashes on low-end phones and slow world loads on /run and /community. Old clients still get the flat shape.

### Added

- **Streak on the run summary.** After a run: "🔥 3-day streak · Capture a block tomorrow to reach 4 days", naming the badge when tomorrow unlocks one. Event `streak_shown`.

## 2026-10-22

### Changed

- **Transactions carry MiniKlaim's official Celo attribution tag.** Every write tx (player claims, badge and reward claims, NFT mints, link tx, relayer captures) now ends with the ERC-8021 tag issued by the Celo Attribution Tag Registry instead of the self-chosen `miniklaim` code, which no registry tracked. The tag is read from `NEXT_PUBLIC_CELO_ATTRIBUTION_CODE` and kept out of the repo at Celo's request; with it unset, txs go untagged. `@celo/attribution-tags` bumped to 0.5.

### Fixed

- **No more dead-end "Mint your blocks" inside MiniPay.** MiniPay refuses the `mintTokens` transaction with "Permission denied" whatever the batch size: all 37 mint attempts from 14 players on 22 Oct failed (1 to 700 blocks), while run claims on the same contract go through. Inside MiniPay the profile now shows the recorded blocks and a note that minting isn't available there yet, instead of a button that always fails. Other wallets still mint. To be reverted once MiniPay allows the call.

## 2026-10-21

### Changed

- **Support messages are sent from the app, not the email app.** The support form now posts to `/api/support`, which sends the ticket to support@ through Resend with reply-to set to the player. A topic, a real description (15+ characters) and a reply email are required; the wallet, device and app version are added automatically, and a screenshot can be attached. Three messages per hour per player, plus a honeypot for bots. If sending fails, the form offers the old prefilled email as a fallback. The support address is no longer shown as link text on About ("Contact support"), so players stop copying it into empty emails: of ~74 support emails to 21 Oct, ~45 were empty, a name, a phone number or "Hi", and almost none came through the form. Needs `RESEND_API_KEY` on Railway.

### Fixed

- **Claims no longer dead-end when MiniPay errors.** When the player's own claim tx failed for a reason other than a decline ("An internal error was received", "User not authenticated", "Only SecretKey is supported", the wallet's RPC host unreachable), the app asked the relayer to pay and the server refused because the player "can pay". On 20-21 Oct that left 24 run claims and 23 badge claims with nothing settled. Any non-decline failure of the player's tx now counts as "cannot pay right now"; the run token and the daily cap still apply.
- **NFT mint failures are diagnosable.** All 32 mint attempts on 20-21 Oct failed and were logged only as "tx". The wallet's message and a kind (`no_fee`, `wallet_internal`, `tx`) now go to PostHog and Sentry, and a fee shortfall tells the player to top up.

## 2026-10-20

### Added

- **Support form before the email opens.** "Help" in the footer and the support address on About and Privacy now open a short form: pick what it is about and describe what happened (at least a short sentence) before the email app opens with that text, the wallet, device and app version. 37 of 84 support emails (7-20 Oct) arrived empty or with just a name.

- **Runs of any length settle in one approval** (Hexes v2, behind `NEXT_PUBLIC_<CHAIN>_HEXES_RECORDS`). A capture is recorded on-chain instead of minted as a token: ~3k gas per block instead of ~28k. One player tx now carries up to 8,000 blocks instead of 700. Runs over 700 blocks were 1% of runs but half of all blocks, and could only settle through the capped relayer. Blocks that are already NFTs still move to whoever recaptures them.
- **Live on Celo mainnet** since 2026-10-20 16:29 UTC (Hexes implementation `0xf0250e4f530c38f6eca3c1936fb478a18ee05d7f`, verified on Blockscout). Migration `0014_hexes_v2_markers` fixes the token markers around the switch.
- **Backlog settled.** Every finished run that had not reached the chain (16 runs capped by the daily sponsor allowance, 280 never reported, 37 denied because the player could pay) was recorded by the relayer: 34,922 blocks in 303 txs, ~3.5k gas each. `npm run runs:settle-backlog` repeats it when needed.
- **Mint your blocks as NFTs** from the profile, when you choose: up to 700 per tx, you pay the fee. Backed by `mintTokens` with a 15-minute voucher; a block that already has a token is skipped.

- **Pick how you move before Start.** On foot, bike, motorbike, car, bus, train, plane, horse or boat; the last pick is remembered, so only the first run asks. The pick becomes the run's label. A car in city traffic averages bike speed with its stops, so the speed-only label called a 7-minute drive a bike (20 Oct). Speed still checks the pick: a run "on foot" at motor speed is logged for review.
- **Best sustained speed per run** (`max_sustained_kmh`, 30 s windows along the hex path). With no pick (older clients), a slow average with a motor-speed stretch is labelled a car.

### Fixed

- **Error screen after switching pages on some Android MiniPay WebViews** (MINIKLAIM-T). React removes the previous page's hoisted `<head>` tags with `parentNode.removeChild`, and on those WebViews the tag was already gone. The error screen now reloads the page once instead of stopping there.

### Changed

- **Better diagnostics.** Every `<head>` change outside React is recorded as a Sentry breadcrumb, and the `removeChild` error carries a snapshot of `<head>`, so the next event shows what removed the tag. Errors thrown entirely inside a wallet extension's injected script (MetaMask "Failed to connect", MINIKLAIM-13) are kept but sent as warnings, tagged `source: wallet-extension`, and grouped per extension and message.

## 2026-10-19

### Fixed

- **Driving no longer counts as flying.** The in-flight check measured speed between two claim batches by server clock, but phones hand GPS fixes over in bursts (iOS WebViews especially), so one batch could carry 15 s of driving and land a second after the previous one. A car at 55 km/h read as 278-823 km/h and its blocks were dropped as airborne (18 Oct: 39 blocks over two runs). Speed is now measured over a window of at least 30 s (`airborneStep`, migration `0011_air_window`); a real flight is still caught within the first window.
- **Sponsored claims survive a dropped connection.** Sponsor and voucher calls retry up to three times on a network drop or gateway error, and a repeated sponsor call that finds the first one still minting counts as sponsored (MINIKLAIM-12, -G, -X, -7).
- **Runs work on phones that cannot draw the map.** GPS tracking used to start only once the map loaded, so a device without WebGL, or whose GPU fails MapLibre's shaders, could not capture at all. Tracking now starts without the map after 10 s, or at once when the map cannot be created (MINIKLAIM-W).
- **No crash when the run page closes under a finger.** Layer listeners are taken off before the map is removed; a tap during unmount read the cleared style (MINIKLAIM-4).
- **Stale tabs after a deploy.** Next `deploymentId` (the Railway commit) turns version skew into a hard navigation, and chunk-load errors outside React boundaries reload the page once (not on `/run`).
- **Old Android WebViews in MiniPay.** The Startale connector is left out inside MiniPay; its IndexedDB open failed there (MINIKLAIM-10, -11, -K).

### Changed

- **Session replay is off on constrained devices** (2 GB RAM, two cores, or data saver). The recorder script arrived truncated through a data-saver proxy and threw (MINIKLAIM-Y).
- **Sentry filters** wallet-extension "not authorized yet" rejections (MINIKLAIM-Z), the old-WebView IndexedDB failures, and errors whose every frame sits in PostHog's proxied scripts.

## 2026-09-23

### Added

- **One wallet approval per run.** New `MiniKlaimClaimRouter` settles a finished run's hexes and badges in a single `claimAll` transaction, so finishing a run costs one approval instead of two. MiniPay blocked the Mini App listing over this: its provider is plain EIP-1193 with no EIP-5792 (`wallet_sendCalls`), so the wallet cannot bundle calls and the batching has to live in a contract. The router holds `CAPTURER_ROLE` on Hexes and `MINTER_ROLE` on Badges and always mints to the caller, which needs no upgrade to either live contract and no address change. Deliberately non-upgradeable. Gated on `NEXT_PUBLIC_<CHAIN>_CLAIM_ROUTER_ADDRESS`; unset falls back to the previous two-transaction path. Not deployed to any chain yet.
- **`POST /api/runs/[id]/claim-all/voucher`** issues the single EIP-712 voucher covering a run's hexes plus every earned-but-unheld badge.
- **17 new Foundry tests** for the router (voucher forgery, cross-player replay, padded id lists, nonce reuse, idempotent re-claims, role revocation as a kill switch). Suite is now 74 passing across four files.
- **`@/*` path alias in `vitest.config.ts`**, mirroring tsconfig. Any test importing an app module previously failed with "Cannot find package".

### Fixed

- **Duplicate claim prompts after finishing a run.** Two of the prompts MiniPay complained about were races, not design. `usePendingClaim` refetches on `window.focus`, and in MiniPay the wallet drawer opening and closing _is_ a focus event; since `hexes.mint_tx_hash` is only written after `sendTransaction` resolves, the pending-claim prompt offered the player the very run they were approving. Separately, `BadgeClaimPrompt` compares chain-read `heldIds` against voucher eligibility, and a submitted badge transaction is invisible to that read until it confirms. New `lib/wallet/claimInFlight.ts` registry, consulted by both prompts, closes both windows. Not a regression of the earlier `authorizationList: []` fix: that one made `heldIds` come back non-empty at all, this is the timing window that remains once it works.

### Documentation

- **Docs reconciled against live state** rather than against each other. Corrections: the basemap is OpenFreeMap, not CARTO (swapped 2026-08-27); `cron-retry-unminted` runs `0 */4 * * *`, not `*/20 * * * *` (confirmed from the Railway service manifest); the Foundry suite is 74 tests, not 57.
- **New "Funding the relayer" runbook** in DEPLOYMENT.md. The relayer's gas balance is an availability dependency: when it runs dry, sponsored mints and the retry cron fail and player territory silently stops reaching the chain. Documented with the real failure signature and the reason Celo needs a larger buffer than Soneium (200 gwei base fee vs ~0.001 gwei).
- **Production env drift recorded**: `NEXT_PUBLIC_SITE_URL` is not actually set on the `web` service, and the legacy `NEXT_PUBLIC_MINIKLAIM_*` address vars are still present but dead.

## 2026-08-08

### Added

- **Open-mode capture: any transport counts.** Walk, run, bike, drive, fly - the game claims every hex you cross regardless of speed. New `interpolateHexIds` helper walks the segment between GPS pings so hexes are never skipped, and the `/api/runs/[id]/claim` endpoint accepts batched hexes in one round trip.
- **PostHog product analytics + session replay + Web Vitals + exception capture.** Typed event catalog (`lib/analytics.ts`), same-origin `/ingest` proxy so mobile ad blockers cannot drop calls, `capture_exceptions` wired to global `window.onerror`. Dashboard "MiniKlaim health" pinned in the project with 5 tiles (run funnel, onboarding engagement, wallet-env split, LCP p75 by pathname, exceptions). Alert fires if exceptions exceed 5/hour.
- **Emoji sweep** on high-value UI strings across EN and ES: 📋 Copy link, ✅ Copied, 🗺️ Move anywhere, 👤 Pick your name, 🏆 Capture more territory, 🏅 Badges, 💰 Rewards, 🔗 Link another wallet, ✨ Pick a name, 💬 Get in touch.
- **`Privacy · Terms` footer** on the home page. Data showed 0 discovery through /about; MiniPay Stage 2 also requires these linkable from the home surface.
- **Vitest test runner** wired with `test` + `test:watch` scripts. First suite: `lib/map/hex.test.ts` covering `interpolateHexIds` (6 tests, all pass).
- **`/dashboard` admin page localized** via `serverT` so partners opening it in either language see a polished view. Duplicate "Claim txs" label disambiguated to "Hex claim txs" vs "Badge claim txs".

### Changed

- **Copy neutralization** where wording gated the mental model on running: home CTA "Sign in to run" -> "Sign in to play"; welcome body "running game" -> "game" with "on foot, by bike, in a car" aside; `me.runs.running` badge -> "active"; onboarding step 1 -> "Move anywhere". Farcaster manifest description + tags aligned. Kept: MiniKlaim name, "Run it. Klaim it." tagline, 🏃 emoji, short button labels.
- **Speed display switched to a rolling 30s window** in the live banner (`formatRollingSpeed`). The run summary still shows session average (`formatSpeed`). No upper km/h cap.
- **Spanish orthography restored** across the dictionary and on-chain badge names: `Un ano` -> `Un año`, `dias` -> `días`, `Estadisticas` -> `Estadísticas`, `Terminos` -> `Términos`, `Anonimo` -> `Anónimo`, etc.
- **Retry-unminted cron** now waits for each chunk's tx receipt before firing the next (fixes a nonce collision that rejected chunk 2 with "Missing or invalid parameters"). Cron schedule moved from every 20 min to every 4 hours.

### Fixed

- **Locale toggle** was silently a no-op for 20 of the 21 components that consume the i18n hook. Each had its own `useState<Locale>` copy. Now backed by a `useSyncExternalStore` over module-level state; a single toggle flips every consumer, and `router.refresh()` re-runs server components so the home tagline and `/p/[username]` update too.
- **GPS position dot** was blank until the first high-accuracy `watchPosition` update (5-30s on mobile, sometimes never on iOS MiniPay). Three chained bugs - eager primer never painted, source-not-ready race with the map's `load` event, accuracy filter dropping the whole sample including the render. Extracted `renderPositionDot` helper called from all three sites; accuracy gate now only affects capture, not the visual marker.
- **`badgeArt.ts` `BADGE_META_ES`** contained multiple ASCII-only Spanish words, most visibly `Un ano` (anus) for badge 33 instead of `Un año` (one year). Fixed across all 55 badges.

### Removed

- **Anti-cheat rate limits and speed caps.** `HEX_RATE_LIMIT_PER_MIN`, `MIN_SECONDS_BETWEEN_HEX`, `RUN_AVG_SPEED_MAX_MPS`, and `validateFinish` are gone by product decision. Kept `ACCURACY_MAX_METERS = 30` (UX) and `DISTANCE_MAX_PER_CAPTURE = 10000` (GPS-teleport bug canary).
- **25 stale branches** (10 local, 15 remote) - all already merged into `main`.

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
