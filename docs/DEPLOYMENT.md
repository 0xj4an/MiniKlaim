# Deployment

How MiniKlaim is deployed to production. Current setup: Railway (web + postgres + cron services), Celo and Soneium contracts deployed via Foundry.

For local dev see [LOCAL-DEV.md](LOCAL-DEV.md).

## Overview

```text
GitHub main branch  ->  Railway auto-deploy  ->  web + postgres + crons
                                                       |
                                                       v
                                                Celo mainnet
                                                Soneium mainnet
```

- **Web service (Next.js)**: auto-deploys on push to `main`. `preDeployCommand: npm run db:migrate` runs Drizzle migrations on every deploy.
- **Postgres**: managed by Railway (`chikeozulumba/postgres-postgis-h3` image, includes PostGIS + H3 extensions).
- **Cron services**: two separate Railway services running scheduled scripts. See [Cron services](#cron-services) below.
- **Contracts**: deployed manually via Foundry scripts. Not auto-deployed.

## Web service

**Railway project**: `MiniKlaim`
**Service**: `web`
**URL**: https://miniklaim.fun (apex) + https://www.miniklaim.fun (www)
**Region**: US West
**Repo**: `0xj4an/MiniKlaim`
**Branch**: `main`

### Required environment variables

Set via Railway UI or `railway variables --service web --set "KEY=VALUE"`:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `${{postgres.DATABASE_URL}}` (reference) |
| `SERVER_SIGNER_PRIVATE_KEY` | EOA that holds admin + operational roles on all contracts. Same key runs the relayer. **Rotate on suspected compromise.** | `0x...` |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL for OG images | `https://www.miniklaim.fun` |
| `NEXT_PUBLIC_CELO_HEXES_ADDRESS` | Hexes proxy address on Celo | See [CONTRACTS.md](CONTRACTS.md) |
| `NEXT_PUBLIC_CELO_BADGES_ADDRESS` | Badges proxy address on Celo | See [CONTRACTS.md](CONTRACTS.md) |
| `NEXT_PUBLIC_SONEIUM_HEXES_ADDRESS` | Hexes proxy address on Soneium | See [CONTRACTS.md](CONTRACTS.md) |
| `NEXT_PUBLIC_SONEIUM_BADGES_ADDRESS` | Badges proxy address on Soneium | See [CONTRACTS.md](CONTRACTS.md) |
| `NEXT_PUBLIC_LINK_VERIFIER_ADDRESS` | Destination for the tx-based link-ownership proof. Same as deployer/relayer. | `0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83` |
| `NEXT_PUBLIC_CELO_REWARDS_ADDRESS` | (Optional) MiniKlaimRewards proxy. Leave empty until MiniPay Stage 2 activation. | (unset) |
| `ETHERSCAN_API_KEY` | For contract verification | `...` |

### Deploy commands

Manual deploy from local (rare, prefer `git push` triggered):

```bash
railway link --project MiniKlaim --environment production
railway service link web
railway up
```

Watch logs:

```bash
railway logs --service web
```

## Cron services

Two cron services keep the app self-healing:

### `cron-finalize-orphans`

**Command**: `npm run runs:finalize-orphans`
**Schedule**: `0 * * * *` (every hour at :00)
**Purpose**: closes runs stuck without `endedAt` after 6+ hours. Prevents users from getting stuck on a "Continue running" prompt after their app killed mid-run.

**Env vars**:
- `DATABASE_URL` (reference `${{postgres.DATABASE_URL}}`)

### `cron-retry-unminted`

**Command**: `npm run runs:retry-unminted`
**Schedule**: `*/20 * * * *` (every 20 min at :00, :20, :40)
**Purpose**: retries `captureBatch` for runs whose hexes never made it on-chain (client `claimRun` failed, backend `sponsor-mint` timed out, or user closed the app before minting). Idempotent because the contract's `capture` mint-or-transfers per hex.

**Env vars**:
- `DATABASE_URL` (reference `${{postgres.DATABASE_URL}}`)
- `SERVER_SIGNER_PRIVATE_KEY` (reference `${{web.SERVER_SIGNER_PRIVATE_KEY}}`)
- `NEXT_PUBLIC_CELO_HEXES_ADDRESS` (reference `${{web.NEXT_PUBLIC_CELO_HEXES_ADDRESS}}`)

### Creating cron services from scratch

If you're standing up a new environment, the CLI does not directly expose `cronSchedule` + `startCommand`. Use the Railway GraphQL API via `railway api`:

```graphql
mutation {
  serviceCreate(input: {
    projectId: "<PROJECT_ID>"
    environmentId: "<ENV_ID>"
    name: "cron-finalize-orphans"
    source: { repo: "0xj4an/MiniKlaim" }
    branch: "main"
  }) { id name }
}
```

Then set the schedule + start command:

```graphql
mutation {
  serviceInstanceUpdate(
    serviceId: "<SERVICE_ID_FROM_ABOVE>"
    environmentId: "<ENV_ID>"
    input: {
      startCommand: "npm run runs:finalize-orphans"
      cronSchedule: "0 * * * *"
    }
  )
}
```

Then set environment variables via `railway variables --service <NAME> --set ...`.

## Contract deployment

Contracts are deployed manually via Foundry, not by Railway. Same deployer EOA on every chain.

### First-time deploy of a contract

```bash
cd contracts
set -a; source ../.env.local; set +a  # load SERVER_SIGNER_PRIVATE_KEY + ETHERSCAN_API_KEY

# Celo mainnet, with source verification on Celoscan in the same call
forge script script/DeployHexes.s.sol:DeployHexes \
  --rpc-url https://forno.celo.org \
  --broadcast \
  --slow \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --verifier-url "https://api.celoscan.io/api"
```

The console prints the implementation address and the PROXY address. The PROXY goes in the env.

### Upgrading an existing contract

UUPS upgrade is a single tx from the `DEFAULT_ADMIN_ROLE` holder:

```bash
# 1. Deploy the new implementation
forge create --rpc-url https://forno.celo.org \
  --private-key "$SERVER_SIGNER_PRIVATE_KEY" \
  --verify --etherscan-api-key "$ETHERSCAN_API_KEY" \
  contracts/src/MiniKlaimHexes.sol:MiniKlaimHexes

# 2. Call upgradeToAndCall from the admin
cast send <PROXY_ADDRESS> \
  "upgradeToAndCall(address,bytes)" \
  <NEW_IMPLEMENTATION_ADDRESS> 0x \
  --rpc-url https://forno.celo.org \
  --private-key "$SERVER_SIGNER_PRIVATE_KEY"
```

**Storage layout must be preserved.** See the `__gap` array in each contract; when adding a new state variable, reduce the gap by the same slot count.

## Database migrations

`preDeployCommand: npm run db:migrate` in `railway.json` runs Drizzle migrations on every Railway deploy. Idempotent: `CREATE INDEX IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`.

To apply migrations manually against the prod DB (rare):

```bash
DATABASE_URL="$(railway variables --service web --json | jq -r .DATABASE_URL)" \
  npx drizzle-kit migrate
```

Never edit an already-applied migration file. Instead, generate a new one:

```bash
npm run db:generate  # after editing lib/db/schema.ts
# Commits the new file under lib/db/migrations/
```

## Domain configuration

Both `miniklaim.fun` (apex) and `www.miniklaim.fun` (www) serve HTTPS directly from Railway with Let's Encrypt certs. Managed via Namecheap DNS:

- `CNAME @  -> rhpk04bb.up.railway.app` (apex CNAME, provider allows this via ALIAS)
- `CNAME www -> rhpk04bb.up.railway.app`
- `TXT _railway-verify` for domain ownership check

## Rollback

Rollback is a matter of reverting the offending commit and pushing to `main`. Railway auto-deploys the revert.

For a fully-broken deploy, restart from an earlier known-good deployment via the Railway UI (Service > Deployments > [pick past deploy] > Redeploy).

Database migrations are additive-only (CREATE INDEX, CREATE TABLE, ADD COLUMN). No destructive migrations exist. A code revert never needs a schema rollback.
