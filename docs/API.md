# API reference

All API routes live under `app/api/`. Each is a Next.js App Router route handler declared with `dynamic: "force-dynamic"` (no ISR).

For architecture context see [ARCHITECTURE.md](ARCHITECTURE.md).

## Conventions

- **Auth**: wallet address only. No sessions, no cookies for auth, no OAuth. Any endpoint that takes an `[address]` path segment trusts that segment as-is; endpoints that mutate state on the wallet's behalf either verify a wallet-signed EIP-712 voucher or a wallet-signed on-chain transaction (never `personal_sign`; MiniPay does not support it).
- **Chain selection**: most write endpoints accept `?chain=celo` (default) or `?chain=soneium` as a query param. See `parseChainKey` in [`lib/onchain/chains.ts`](../lib/onchain/chains.ts).
- **Content types**: request bodies are JSON. Responses are JSON.
- **Error format**: `{ error: string, detail?: string }` with an appropriate HTTP status. Common: 400 (bad input), 404 (not found), 409 (state conflict), 429 (rate limited), 503 (feature not configured).

## Endpoints

### Runs

| Method + path | Purpose |
|---|---|
| `POST /api/runs` | Start a run for the connected wallet. Body: `{ address }`. Returns `{ id, startedAt }`. |
| `POST /api/runs/[id]/claim` | Add captured hexes to an active run. Two body shapes accepted: (1) legacy single `{ h3, distanceMeters?, accuracy? }`; (2) batch `{ hexes: [{ h3, distanceMeters?, accuracy? }, ...] }` used by the interpolation path (client sends every hex crossed since the previous GPS ping in one round trip). Each hex is validated for accuracy (`> 30m` rejected) and distance canary (`> 10km` rejected). Returns per-hex results in `{ ok, results: [{ h3, alreadyOwned?, rejected? }] }` for batch calls; legacy `{ ok, alreadyOwned }` for singular. |
| `PATCH /api/runs/[id]/finish` | Close a run. No anti-cheat sanity check — game accepts any transport mode. Returns the closed run row. |
| `POST /api/runs/[id]/voucher` | Issue an EIP-712 voucher for the player to submit `claimRun` on-chain. Returns `{ tokenIds, nonce, signature, contract, chainId }`. Returns 409 if the run has no captured hexes. |
| `POST /api/runs/[id]/claimed` | Backend hook confirming a mint tx has landed. Body: `{ txHash }`. |
| `POST /api/runs/[id]/sponsor-mint` | Sponsored fallback: backend relayer runs `captureBatch` on-chain when the player cannot pay gas. |

### Users

| Method + path | Purpose |
|---|---|
| `GET /api/users/[address]` | Player profile: username, stats, on-chain state. |
| `PATCH /api/users/[address]/username` | Set the player's username. |
| `GET /api/users/[address]/stats` | Aggregated stats across all wallets linked to this player. |
| `GET /api/users/[address]/runs` | Recent runs for the player. |
| `GET /api/users/[address]/runs/active` | The currently-open run, or null. |
| `GET /api/users/[address]/runs/pending-claim` | Runs whose hexes have not yet been minted; drives the `/me` pending-claim prompt. |
| `GET /api/users/[address]/badges` | Which badges the player currently qualifies for. |
| `POST /api/users/[address]/badges/voucher` | Issue an EIP-712 voucher for `claimBadges`. |
| `POST /api/users/[address]/badges/sponsor-mint` | Sponsored `mintBatch` fallback for badges. |
| `POST /api/users/[address]/rewards/voucher` | (Dormant) EIP-712 voucher for USDm rewards. Returns 503 unless `NEXT_PUBLIC_CELO_REWARDS_ADDRESS` is set. |
| `GET /api/users/[address]/linked` | All wallets linked to this player's identity. |

### Cross-wallet linking

| Method + path | Purpose |
|---|---|
| `POST /api/link` | Wallet A (already registered) generates a short-lived link code. Body: `{ address }`. Returns `{ code }`. |
| `POST /api/link/redeem` | Wallet B claims the code by pointing at an on-chain ownership-proof tx. Body: `{ code, txHash }`. Backend fetches the tx receipt, verifies `tx.to == chain.linkVerifier` and `tx.input starts with keccak256(code)`, then links B to A's player. Returns 202 while the tx is unconfirmed. |

### Content + discovery

| Method + path | Purpose |
|---|---|
| `GET /api/hexes` | All captured hexes (H3 id, owner, username, claimedAt) for the world map. |
| `GET /api/leaderboard` | Global leaderboard. |
| `GET /api/activity` | Recent activity feed. |
| `GET /api/stats` | Basic stats (players, blocks, runs). |
| `GET /api/stats/analytics` | Extended metrics: DAU/WAU/MAU, retention D1/D7/D30, topCountries, on-chain tx windows. |
| `GET /api/profile/[username]` | Public profile lookup by username. |

### On-chain metadata (served for wallets and explorers)

| Method + path | Purpose |
|---|---|
| `GET /api/onchain/badges/[id]` | ERC-1155 metadata JSON for badge `id`. |
| `GET /api/onchain/badges/[id]/image` | SVG art for badge `id` (hexagon medallion). |

### Miscellaneous

| Method + path | Purpose |
|---|---|
| `POST /api/webhook` | External webhook receiver (reserved). |

## Rate limits

Only `/api/runs/[id]/claim` enforces explicit rate limits (via the GPS spoof validation module). Everything else has no per-endpoint rate limit today; front the app with Railway's edge rate limiter or Cloudflare if that becomes necessary.

## Deprecations

`link.signNote` string and the old `signature`-based `/api/link/redeem` payload were removed on 2026-08-01. The endpoint now expects `{ code, txHash }`.

`NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS` and `NEXT_PUBLIC_MINIKLAIM_BADGES_ADDRESS` env-var fallbacks were removed. Use `NEXT_PUBLIC_CELO_HEXES_ADDRESS` and `NEXT_PUBLIC_CELO_BADGES_ADDRESS`.
