# Local development

Full setup guide for running MiniKlaim locally. For a fast start, see the README's Quick Setup section.

## Prerequisites

- **Node.js 22.x LTS or newer**. The repo currently builds with 22.22+.
- **npm 10+**. Bundled with Node 22.
- **Postgres 15 or 16** with the PostGIS and H3 extensions (optional for basic dev; required if you want to seed the world map).
- **Foundry** for Solidity development. Install with `curl -L https://foundry.paradigm.xyz | bash && foundryup`.
- **A wallet with a small amount of gas** on Celo mainnet (for local mint testing against prod contracts) OR use a local Anvil fork.

## First-time setup

```bash
git clone https://github.com/0xj4an/MiniKlaim.git
cd MiniKlaim
npm install
```

Install contract dependencies (uses the vendored `install-deps.sh`):

```bash
cd contracts
./install-deps.sh
cd ..
```

## Postgres

Any Postgres 15+ instance works. Local options:

**Docker (recommended)**:

```bash
docker run -d --name miniklaim-pg \
  -e POSTGRES_PASSWORD=miniklaim \
  -e POSTGRES_DB=miniklaim \
  -p 5432:5432 \
  chikeozulumba/postgres-postgis-h3
```

(This is the same image Railway uses in production.)

**Homebrew / apt**:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb miniklaim
```

Then apply the schema:

```bash
npm run db:push
```

Optional: seed the world map with historical player territory for a populated dev environment:

```bash
npm run db:seed:world
```

## Environment variables

Copy the example and fill in what you need:

```bash
cp .env.example .env.local
```

Minimum for the app to run locally:

```dotenv
DATABASE_URL=postgresql://postgres:miniklaim@localhost:5432/miniklaim
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

If you want on-chain reads and mint testing, also set the contract addresses (Celo mainnet values in [CONTRACTS.md](CONTRACTS.md)) plus `NEXT_PUBLIC_LINK_VERIFIER_ADDRESS` (the relayer EOA) and `SERVER_SIGNER_PRIVATE_KEY` (only needed for the sponsored / voucher flows).

Full env-var reference: see `.env.example` at the repo root and [DEPLOYMENT.md](DEPLOYMENT.md).

## Run the app

```bash
npm run dev
```

Open <http://localhost:3000>. The app opens on the "You" (home) route.

To test wallet flows, use:

- **Chrome + MetaMask extension**: normal wallet path.
- **ngrok + MiniPay**: to test the MiniPay-specific behavior (auto-connect, no `personal_sign`, mobile viewport). Run `ngrok http 3000`, open the ngrok URL inside MiniPay on Android.
- **Farcaster Mini App preview tool**: paste the ngrok URL there.

## Contracts

Foundry is used for all Solidity work.

```bash
cd contracts
forge build              # compile
forge test               # run all tests
forge test -vv           # more verbose
forge test --gas-report  # gas snapshot
forge fmt                # format
```

For a specific contract:

```bash
forge test --match-contract MiniKlaimHexes -vv
```

The contracts do not need a running node for tests; Foundry uses its own EVM.

## Testing GPS validation locally

GPS validation is server-side and takes the request body's `accuracy` field as authoritative. To simulate a bot:

```bash
curl -X POST http://localhost:3000/api/runs/<runId>/claim \
  -H "Content-Type: application/json" \
  -d '{"h3":"8c754a0a4c3c1ff","distanceMeters":10,"accuracy":50}'
```

Expected response: HTTP 429 with `{"error":"accuracy-too-poor","detail":"accuracy 50m > 30m"}`.

## Testing MiniPay compliance locally

- No `useSignMessage` calls should appear in any wallet-interaction path. Grep for it:

  ```bash
  grep -rn "useSignMessage\|personal_sign" app lib
  ```

  Expected: zero matches in `app/` or `lib/`.
- Speed display should show `km/h`, not `M:SS/km`.
- Wrong-network banner should use the i18n key `home.cta.wrongNetwork`, never a hardcoded string containing "Chain".

## Common issues

### `Error: relation "hexes" does not exist`

Run `npm run db:push` to apply the schema, or `npm run db:migrate` if you have local migration state.

### `viem returns "Missing or invalid parameters" on multicall`

You've probably added a `multicall` call with `allowFailure: true` but missed `authorizationList: undefined`. viem 2.x requires it explicitly. See existing usages in `lib/onchain/rewards.ts` and `lib/onchain/badges.ts`.

### `preDeployCommand failed` in Railway build

Migration order matters. If Railway's DB is behind, apply the missing migrations manually with `npm run db:migrate` connected to that DB.

### MiniPay shows blank screen

Check that:

- The site is HTTPS (use ngrok, not raw http).
- The route calls `sdk.actions.ready()` at some point (see `app/FarcasterReady.tsx`).
- There's no `personal_sign` in the initial connect flow.
