# MiniKlaim Technical Specification

System architecture, data flow, contracts, and key invariants. Read alongside the codebase, not in place of it.

Last updated: 2026-05-22.

---

## 1. Architecture overview

```text
+-----------------------------+
|  MiniPay in-app browser     |   <- 360x640 mobile, primary target
|  (or Chrome / Safari / etc) |
+--------------+--------------+
               |
               | HTTPS, wagmi injected provider (window.ethereum)
               v
+--------------+--------------+
|  Next.js 16 App Router      |
|  app/                       |
|    page.tsx       (home)    |
|    run/page.tsx   (active)  |
|    me/page.tsx    (profile) |
|    community/     (leaders) |
|    p/[username]/  (public)  |
|    stats/         (analytics)|
|    api/           (route hand.)|
+--------------+--------------+
               |
               | postgres (drizzle ORM)
               v
+--------------+--------------+
|  Postgres + PostGIS         |   <- source of truth for UX
|    users, runs, hexes       |   <- real-time hex ownership
|    activity, mint_queue     |
+--------------+--------------+
               |
               | server signer (CAPTURER_ROLE)
               v
+--------------+--------------+
|  Celo L2 mainnet (chain 42220)|
|  MiniKlaimHexes (ERC-721)   |   <- on-chain mirror, durable record
|  MiniKlaimBadges (ERC-1155) |   <- WIP, soulbound achievements
+-----------------------------+
```

Hosting: Railway (Next.js + Postgres). Domain: `miniklaim.fun` (Namecheap DNS).

---

## 2. Data model

### 2.1 Off-chain (Postgres)

`lib/db/schema.ts`:

- **users**: `address` (PK), `phone` (nullable, future ODIS), `username` (unique), `created_at`
- **runs**: `id` (UUID), `user_address`, `started_at`, `ended_at` (nullable while active), `hexes_claimed`, `distance_meters`
- **hexes**: `h3_id` (PK, string), `owner_address`, `claimed_at`, `run_id`

**Not in schema yet (to add):**

- `mint_queue`: tracks pending on-chain mints. Columns: `id`, `h3_id` (nullable, single-mint), `batch` (jsonb of h3 ids for batched), `tx_hash` (nullable until mined), `status` (`pending|sent|confirmed|failed`), `attempts`, `last_error`, `created_at`, `updated_at`. Cron retries `failed` rows up to N times with exponential backoff.
- `badges`: `user_address`, `badge_id` (uint8 enum), `unlocked_at`, `tx_hash` (nullable until minted).
- `activity` (already exists per `lib/useActivity.ts`): verify schema and document.

### 2.2 On-chain (Celo mainnet)

**MiniKlaimHexes** (`contracts/src/MiniKlaimHexes.sol`):

- ERC-721 + AccessControl
- `tokenId = uint256(h3Index)` where `h3Index` is the H3-resolution-12 cell id of a captured hex
- `CAPTURER_ROLE` is held by the server signer (`0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83`)
- `capture(player, h3Id)` mints if unowned, transfers from previous owner otherwise
- `captureBatch(player, h3Ids[])` same but loops
- `_update` override blocks all transfers initiated via `transferFrom` (`TransfersDisabled` revert). Only the internal `_capture` path is allowed.
- `tokenURI(id)` returns `<baseUri>/<id>` -> server resolves to JSON `{ name, image, lat, lng }`
- Address: `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` (Celo mainnet)

**MiniKlaimBadges** (planned, ERC-1155 soulbound):

- 12 token ids total: 10 existing UI badges + `FirstHex` + `TopOfMonth`
- `MINTER_ROLE` held by server signer
- All transfers blocked (`_update` override returns to sender or reverts)
- `tokenURI(id)` returns static metadata per badge type
- Monthly snapshot job picks the leader, mints `TopOfMonth` (id 12) on the 1st of each month at 00:00 UTC

### 2.3 H3 hex resolution

Resolution 12 = ~307 m^2 per hex, ~13 m edge length. Each ~30-second running pace through a city block captures 1-3 hexes. This is the right granularity: dense enough that a 5K run captures 50+ hexes, sparse enough that two runners cannot perfectly overlap.

**Coordinate flow:**
- Browser GPS sample -> client-side H3 lookup (`h3-js`) -> server validation -> insert in `hexes` table -> emit to UI via React Query refetch -> queue for on-chain mint

---

## 3. Run lifecycle

```text
Player taps Start ->
  POST /api/runs { address }
  -> insert into runs (started_at = now, ended_at = null)
  -> return run_id

Browser starts watchPosition, sample every 1s -
  for each sample:
    compute h3 = latLngToCell(lat, lng, 12)
    if h3 changed since last sample and accuracy < 30m:
      POST /api/hexes { h3, run_id, address }
      -> server: upsert hex; if owner changed, emit activity row
      -> server: enqueue (h3, address) in mint_queue
      -> client: optimistic UI update

Player taps Finish ->
  POST /api/runs/[id]/finish
  -> set ended_at = now, hexes_claimed = count(hexes where run_id), distance_meters = computed
  -> server: drain mint_queue for this run as a single captureBatch tx
  -> server: evaluate badge thresholds; enqueue badge mints
  -> redirect /me
```

### Failure modes

| Failure | Today | Should |
|---------|-------|--------|
| GPS accuracy poor | Hex still captured | Reject samples with `coords.accuracy > 30m` |
| Player closes browser mid-run | Run stays open (ended_at = null) | Auto-finalize runs older than 24h via cron |
| Capture tx reverts | Player still sees hex in UI | Mark queue row `failed`, retry up to 5x with backoff; surface as `failed-tx rate` on /stats |
| Player runs in moving vehicle | All hexes captured | Reject runs where average pace > 25 km/h |
| Player teleports (GPS spoof) | All hexes captured | Reject samples where distance from previous sample / elapsed time > 10 m/s |

These are the GPS-spoofing mitigations from `STRATEGY.md` §8. None implemented yet. Backlogged in `IMPROVEMENTS.md`.

---

## 4. MiniPay-specific code paths

### Detection

`lib/minipay.ts`:

```ts
export function isMiniPay(): boolean {
  return typeof window !== "undefined" && window.ethereum?.isMiniPay === true;
}
```

### Wallet environment classification

`lib/wallet/environment.ts` returns one of:
- `minipay` - auto-connect, hide all wallet UI
- `browser-wallet` - manual connect via injected
- `telegram-webview` - block + show "open in browser" message
- `mobile-no-wallet` / `desktop-no-wallet` - install MetaMask prompt
- `unknown` - still detecting

### Auto-connect + auto-switch

`lib/wallet/useWallet.ts`:
1. On mount, run `isMiniPay()` once via queueMicrotask. Store in state `inMiniPay`.
2. If `inMiniPay && !isConnected`, find the `injected` connector and call `wagmiConnect`. No user action.
3. If connected on a non-Celo chain, fire `wagmiSwitchChain({ chainId: celo.id })` exactly once.

### Wagmi config

`lib/wallet/config.ts`:

```ts
createConfig({
  chains: [celo],
  connectors: [injected()],
  storage: createStorage({ storage: cookieStorage }), // SSR-safe
  ssr: true,
  transports: { [celo.id]: http() },
})
```

Single chain (no Alfajores). MiniPay only supports mainnet for production apps.

---

## 5. Contracts: design notes

### Why transfers are disabled

A common move-to-earn anti-pattern is a free market that lets bot farms strip-mine then re-sell territory. Our `_update` override revert (`TransfersDisabled`) eliminates the rentable secondary market. Hexes can only change owner via the `_capture` path - which requires actually running there.

This is reversible: a future v2 contract can re-enable transfers under specific rules (e.g. "transfers allowed during city event windows only").

### Why `tokenId = uint256(h3Index)`

H3 indexes are 64-bit uints with built-in geographic semantics. Using them directly as token ids means:
- The chain itself encodes the location
- `tokenURI(id)` can compute lat/lng on the fly with no DB lookup
- Collisions are impossible (each H3 cell is globally unique)

Tradeoff: token ids are huge numbers, not 1..N. Wallets and explorers handle this fine but it looks weird.

### Sponsored gas economics

Per mint on Celo: ~0.0001 CELO = ~$0.00005 (at $0.5 CELO).

At 100K hex captures lifetime (rough Q3 target), total gas cost is ~$5. Even with 1M lifetime captures, cost is ~$50. Server signer wallet was funded with 1 CELO (~$0.5) initially; this lasts indefinitely.

### Role separation

- `DEFAULT_ADMIN_ROLE` - founder wallet, only used for `setBaseURI` and emergency role changes
- `CAPTURER_ROLE` - server signer wallet (the one with the hot private key on Railway)

Server signer is intentionally separate from admin so leaking the server key cannot upgrade the contract or revoke roles.

### Pending decisions

- **Badges contract:** ERC-1155 vs N x ERC-721. ERC-1155 is cheaper and standard. Decision: ERC-1155 unless we discover a wallet display issue.
- **Soulbound implementation:** override `_update` to revert on any transfer where `from != address(0) && to != address(0)`. Mint (from==0) and burn (to==0) both allowed for admin recovery cases.
- **Top-of-month evaluation:** cron job at month boundary computes the leader, calls `mintBatch`. Tie-breaker: earliest-claimed-first.

---

## 6. API surface (current)

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/users/[address]` | GET | none | Resolve username from address |
| `/api/users/[address]` | PUT | implicit (caller IS address) | Set username |
| `/api/runs` | POST | implicit | Start a run |
| `/api/runs/[id]` | GET | none | Run detail |
| `/api/runs/[id]/finish` | POST | implicit | End run, trigger mint queue |
| `/api/hexes` | POST | implicit | Capture a hex from GPS sample |
| `/api/activity` | GET | none | Recent activity feed |
| `/api/leaderboard` | GET | none | Top runners |
| `/api/profile/[username]` | GET | none | Public profile |
| `/api/stats/analytics` | GET | none | `/stats` page data |

**Auth model:** "implicit" = the request body / param contains an address, and we trust it. There is no signature verification. Trade-off:
- Pro: no signatures = MiniPay-compatible (no `personal_sign` allowed)
- Con: anyone can impersonate any address in API calls

**Mitigation:** the only thing impersonation buys you is fake-finishing someone else's run. They cannot withdraw funds, cannot transfer NFTs, cannot change someone's username (we check it is unset before allowing PUT). Worst case is griefing. Acceptable risk for the current scope.

If we ever introduce real money flows, switch to a session-token model (server-issued cookie tied to an address-proof through a one-time `personal_sign` outside MiniPay, or to an MiniPay-compatible auth scheme TBD).

---

## 7. Internationalization

`lib/i18n.ts` + `lib/i18nDict.ts`: client-side EN/ES dictionary.
`lib/i18nServer.ts`: server-rendered routes pick locale from Accept-Language header.

Locale toggle is on every page (footer link). State persisted to `localStorage`.

OG images render in the active locale (`/opengraph-image.tsx` reads cookie/header).

### Adding a language

1. Add the locale key to `Locale` union in `lib/i18n.ts`.
2. Add a new top-level object in `lib/i18nDict.ts`.
3. Translate every key. Missing keys fall back to `en`.
4. Test `/p/[username]` server-rendered route in that locale.

PT-BR is the next planned locale (Brazil expansion).

---

## 8. Performance

Current measured: never. **Action:** measure PageSpeed mobile on prod, document baseline here.

### Known load-time hot spots

- `maplibre-gl` is heavy (~250 KB gzip). Deferred off the home critical path via dynamic import in `community/` and `run/` routes only.
- `h3-js` is loaded client-side; smaller than maplibre but non-trivial. Same dynamic-import treatment in `run/`.
- Hero font loads from system fallback - no Google Fonts to avoid the FCP penalty.

### Bundle invariants

- Home `/` route should be < 100 KB gzip. Verify with `next build --debug` after every PR.
- No `useEffect` race conditions on first paint (use `queueMicrotask` for env detection).

---

## 9. Logging

`lib/logger.ts` (per global `~/.claude/rules/logging.md`):

- Namespaces: `wallet:minipay`, `wallet:useWallet`, `page:stats`, etc.
- Levels: `debug` in dev, `warn` in prod.
- Never use raw `console.log` in feature code.

In production, only `warn` and `error` reach the browser console. The volume is low enough that Sentry / Datadog is not needed yet.

---

## 10. Deployment

- **Hosting:** Railway. Build = `next build`, start = `next start`.
- **Database:** Railway Postgres add-on. Schema migrations via `drizzle-kit`.
- **DNS:** `miniklaim.fun` (apex) and `www.miniklaim.fun` -> Railway, configured via Namecheap.
- **Env vars (prod):**
  - `DATABASE_URL`
  - `NEXT_PUBLIC_SITE_URL=https://miniklaim.fun`
  - `CELO_RPC_URL=https://forno.celo.org` (or a paid RPC for scale)
  - `HEXES_CONTRACT_ADDRESS=0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47`
  - `BADGES_CONTRACT_ADDRESS=` (WIP)
  - `SERVER_SIGNER_PRIVATE_KEY=` (server wallet, has CAPTURER_ROLE)
  - `ETHERSCAN_API_KEY=` (for Celoscan via v2 unified API)

Server signer private key rotation: planned annually or on any suspected leak. Procedure: deploy a new wallet, fund it, grant CAPTURER_ROLE, revoke from old wallet.

---

## 11. Known tech debt

| Item | Why it matters | Effort | Priority |
|------|----------------|--------|----------|
| No GPS spoof guard | Existential to game integrity once we have prizes | M | High |
| No retry queue for mints | Lost mints when RPC flakes | S | High |
| No D1/D7/D30 cohort retention queries | MiniPay listing requirement | M | High |
| No PostGIS spatial index on `hexes` | Map query slows down past ~100K hexes | S | Medium |
| No prerender of `/p/[username]` | Cold SSR is ~400ms | M | Medium |
| Server signer key on Railway env (hot) | Single point of compromise | M | Medium (KMS later) |
| No automated forge tests in CI | Regressions slip through | S | Low |
| No E2E tests for the run flow | Regressions slip through | M | Low |

Backlog detail: `tasks/IMPROVEMENTS.md`.
