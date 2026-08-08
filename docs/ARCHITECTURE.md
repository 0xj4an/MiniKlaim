# Architecture

High-level view of how MiniKlaim is put together. For contract details see [CONTRACTS.md](CONTRACTS.md), for endpoints see [API.md](API.md), for deployment see [DEPLOYMENT.md](DEPLOYMENT.md).

## System diagram

```text
+-------------------------------------------+
|  Player device (mobile / desktop)         |
|  MiniPay | Farcaster host | Startale | browser wallet
+---------------------+---------------------+
                      | HTTPS
                      v
+---------------------+---------------------+
|  Next.js 16 App Router (Railway)           |
|                                            |
|  app/          UI (Server + Client comps)  |
|  app/api/      Route handlers              |
|  lib/wallet/   Wagmi + viem hooks          |
|  lib/onchain/  Contract clients            |
|  lib/runs/     Run validation + streaks    |
|  lib/db/       Drizzle ORM schema          |
|  lib/map/      H3 hex helpers, MapLibre    |
+---------------------+---------------------+
              |                    |
              | postgres           | RPC (Celo, Soneium)
              v                    v
+-------------+-----+   +----------+-----------+
|  Postgres         |   |  Celo L2 mainnet     |
|  users, runs,     |   |  MiniKlaimHexes      |
|  hexes, players,  |   |  MiniKlaimBadges     |
|  player_wallets,  |   |  (MiniKlaimRewards)  |
|  link_codes       |   +----------------------+
+-------------------+   |  Soneium mainnet     |
                        |  MiniKlaimHexes      |
                        |  MiniKlaimBadges     |
                        +----------------------+
```

## Runtime layers

### Frontend (Next.js App Router)

- Server Components for the LCP path (home tagline, first paint of the map shell).
- Client Components for wallet interactions, MapLibre canvas, live GPS tracking.
- i18n via `lib/i18nDict.ts` (English + Spanish today).
- Wagmi + viem for wallet connection. Auto-connect strategies per host:
  - **MiniPay**: `window.ethereum.isMiniPay === true`, fires `wagmi.connect(injected)`.
  - **Farcaster Mini App**: `@farcaster/miniapp-sdk` detection, `farcasterMiniApp()` connector.
  - **Startale**: `@startale/app-sdk` connector for Soneium smart-account wallets.
  - **Browser**: standard `injected()` connector.
- MapLibre GL renders CARTO tiles + the H3 hex grid as a live GeoJSON source updated per `watchPosition` callback.

### Backend (Next.js API routes)

- All routes are `dynamic: "force-dynamic"` (no ISR).
- Postgres via `drizzle-orm` and `postgres-js`; connection pooled by the driver.
- Server-side signing via viem `privateKeyToAccount(SERVER_SIGNER_PRIVATE_KEY)`. Signs EIP-712 vouchers for `claimRun`, `claimBadges`, `claimRewards` (dormant).
- Sponsored fallback: same signer sends `captureBatch` / `mintBatch` from the backend when the player can't or won't sign the tx themselves.
- GPS validation module at `lib/runs/validation.ts` acts as the choke point for `/api/runs/[id]/claim`.

### Persistence

- Postgres with two roles: source of truth for real-time UX (hex ownership, run state, streaks) and mirror-of-chain for badge eligibility.
- No PostGIS geometry column; hex identity is the `h3_id` text string (H3 resolution 12, ~13m across).
- Country resolution at capture time via `lib/geo/country.ts` and the `country-iso` package. Populates `hexes.country` (ISO 3166-1 alpha-3).
- 8 btree indices on hot-path columns (see [`lib/db/migrations/0005_clean_proudstar.sql`](../lib/db/migrations/0005_clean_proudstar.sql)).

### On-chain

- Two contracts per chain, both UUPS-upgradeable: `MiniKlaimHexes` (ERC-721 territory) and `MiniKlaimBadges` (ERC-1155 soulbound achievements).
- Player transactions carry an ERC-8021 attribution suffix (`@celo/attribution-tags`) so the Celo ecosystem can attribute the activity.
- Fee abstraction via CIP-64 on Celo (USDm / USDC / USDT adapters), with `pickFeeAdapter` selecting the first token the player holds.
- See [CONTRACTS.md](CONTRACTS.md) for addresses, roles, and upgrade model.

## Cross-cutting concerns

### Identity model

- `players` table holds the canonical cross-chain profile (UUID id).
- `player_wallets` table maps `(address, chainId)` to a `playerId`, allowing one player to own many wallets across chains.
- `users` table keys username by address; linked wallets share the username by resolving through the player to whichever linked address has one set.
- Link flow: wallet A generates a short-lived code, wallet B sends an on-chain ownership-proof tx (0-value to a well-known verifier address with `keccak256(code)` as calldata), backend verifies the tx receipt and attaches wallet B to A's player.

### MiniPay constraints (enforced everywhere)

- No `personal_sign` or `eth_signTypedData` (MiniPay does not support message signing). All auth is wallet address only.
- No CELO display in the UI. Fee abstraction is USDm / USDC / USDT.
- UI copy avoids `gas`, `crypto`, `wallet address as primary identifier`, `onramp`, `offramp`, and similar jargon.
- Zero-click connect inside MiniPay: `useWallet` auto-fires the connect on `isMiniPay` detection.
- Mobile 360x640 primary viewport.

### Multichain

- `lib/onchain/chains.ts` is the single source of truth for per-chain configuration: contract addresses, RPC, explorer, fee currencies, link-verifier address, rewards address (dormant).
- Every API route accepts a `?chain=<key>` query param, parsed by `parseChainKey`.
- Client-side, `useActiveChainKey` derives the active chain from `useChainId()`, so every UI action targets the right chain.

### Anti-abuse

- GPS sanity guards in `lib/runs/validation.ts`: accuracy 30m (bad GPS captures the wrong hex, UX not anti-cheat) and per-capture distance 10km (bug canary against GPS teleport). No rate limit, no min-interval, no avg-speed cap — the game accepts any transport mode (walk, run, bike, car, plane) per product decision.
- Client interpolation (`interpolateHexIds` in `lib/map/hex.ts`) walks the segment between GPS pings so hexes are never skipped at speed. The `/api/runs/[id]/claim` endpoint accepts a batch `{ hexes: [...] }` payload so a single fast-movement ping is one HTTP round trip regardless of hex count.

### Attribution

- Every Celo write tx (relayer or player) carries the ERC-8021 attribution suffix via `withAttribution(...)`. Code is `miniklaim`.

## Deployment

- Web app hosts on Railway from `main` branch. `preDeployCommand: npm run db:migrate` applies Drizzle migrations automatically.
- Two cron services on Railway:
  - `cron-finalize-orphans`: hourly (`0 * * * *`), runs `npm run runs:finalize-orphans` to close abandoned runs.
  - `cron-retry-unminted`: every 20 min (`*/20 * * * *`), runs `npm run runs:retry-unminted` to re-sync any hex that failed to mint on-chain.
- Contracts deployed via Foundry scripts (see `contracts/script/`). All chains use the same deployer address.

## What isn't in the code

- **No custody**: MiniKlaim never holds player funds. All value flows go directly to the player's wallet.
- **No off-chain matchmaking or PvP server**: hex ownership races resolve at capture time by contract state.
- **No cross-chain bridging**: hexes captured on Celo stay on Celo; Soneium is a separate world.
- **No off-chain leaderboard**: `/api/leaderboard` reads live from Postgres.
