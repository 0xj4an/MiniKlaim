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
| `NEXT_PUBLIC_LINK_VERIFIER_ADDRESS` | Destination for the tx-based link-ownership proof. Same account as the deployer/relayer. | See [CONTRACTS.md](CONTRACTS.md#deployed-addresses) |
| `NEXT_PUBLIC_CELO_REWARDS_ADDRESS` | (Optional) MiniKlaimRewards proxy. Leave empty until MiniPay Stage 2 activation. | (unset) |
| `NEXT_PUBLIC_CELO_CLAIM_ROUTER_ADDRESS` | (Optional) MiniKlaimClaimRouter. When set, finishing a run costs one wallet approval instead of two. Unset falls back to the two-tx path. | (unset) |
| `NEXT_PUBLIC_SONEIUM_CLAIM_ROUTER_ADDRESS` | Same, for Soneium. | (unset) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog client key (`phc_...`). Public. | `phc_...` |
| `ETHERSCAN_API_KEY` | For contract verification | `...` |

Two notes on the live production service, verified against Railway rather than assumed:

- `NEXT_PUBLIC_SITE_URL` is listed above but is **not currently set** in the production `web` service. OG image URLs fall back to whatever the code defaults to. Set it to `https://www.miniklaim.fun`.
- `NEXT_PUBLIC_MINIKLAIM_HEXES_ADDRESS` and `NEXT_PUBLIC_MINIKLAIM_BADGES_ADDRESS` are still set in production but are **dead**: `lib/onchain/chains.ts` reads only the `NEXT_PUBLIC_CELO_*` names. Safe to delete.

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
**Schedule**: `0 */4 * * *` (every 4 hours, on the hour)
**Purpose**: retries `captureBatch` for runs whose hexes never made it on-chain (client `claimRun` failed, backend `sponsor-mint` timed out, or user closed the app before minting). Idempotent because the contract's `capture` mint-or-transfers per hex.

This job spends the relayer's gas. If the relayer is dry it logs `done: 0 chunks succeeded (0 hexes minted), N chunks failed` and player territory silently stops reaching the chain. See [Funding the relayer](#funding-the-relayer).

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
  --etherscan-api-key "$ETHERSCAN_API_KEY"
```

Do **not** pass `--verifier-url https://api.celoscan.io/api`. That is Etherscan's V1 API and it now rejects submissions with "You are using a deprecated V1 endpoint". Let Foundry derive the V2 endpoint from the `[etherscan]` block in `foundry.toml` instead.

If `--verify` fails for network reasons rather than payload reasons, the deploy still succeeded; verification is a separate, re-runnable step:

```bash
ARGS=$(cast abi-encode "constructor(address,address,address)" <a> <b> <c>)
forge verify-contract <DEPLOYED_ADDRESS> src/<File>.sol:<Contract> \
  --chain-id 42220 --compiler-version 0.8.28 --num-of-optimizations 200 \
  --constructor-args "$ARGS" --etherscan-api-key "$ETHERSCAN_API_KEY" --watch
```

`forge verify-contract --show-standard-json-input` dumps the exact payload if you need to submit it by hand from another machine.

The console prints the implementation address and the PROXY address. The PROXY goes in the env.

### Deploying MiniKlaimClaimRouter

Different from the other three: no proxy, and the script also performs the three role grants the router needs, because a router without them is inert.

Prerequisites, all worth checking before broadcasting:

1. The signer holds `DEFAULT_ADMIN_ROLE` on both target contracts (it does today; it is the deployer).
2. The signer has enough native balance. The script's own estimate is the number to trust:

```bash
cd contracts
set -a; source ../.env.local; set +a   # SERVER_SIGNER_PRIVATE_KEY + addresses

# The script takes its targets explicitly. Read them from the env rather than
# pasting literals, so this command cannot drift from the deployed addresses.
export HEXES_ADDRESS="$NEXT_PUBLIC_CELO_HEXES_ADDRESS"
export BADGES_ADDRESS="$NEXT_PUBLIC_CELO_BADGES_ADDRESS"

# Dry run first. Simulates against real mainnet state, so it fails here if
# the signer lacks a role. Prints the gas estimate.
forge script script/DeployClaimRouter.s.sol --rpc-url celo

# Then broadcast
forge script script/DeployClaimRouter.s.sol --rpc-url celo --broadcast --verify
```

If those two variables come back empty, `.env.local` is carrying the legacy `NEXT_PUBLIC_MINIKLAIM_*` names. Canonical values are in [CONTRACTS.md](CONTRACTS.md#deployed-addresses).

Actual cost of the 2026-09-23 Celo mainnet deploy: 1,176,972 gas across four transactions (1,012,334 for the CREATE plus three grants of 51k-57k each), which came to 0.235 CELO at the 200 gwei base fee. Foundry estimated 1,543,437 gas and asked for a 0.62 CELO buffer, so budget the buffer and expect to spend about a third of it. Celo's base fee sits at 200 gwei as a floor, so waiting for a cheaper moment does not help.

After a successful broadcast:

1. Put the router address in `NEXT_PUBLIC_CELO_CLAIM_ROUTER_ADDRESS` on the `web` service.
2. Confirm one run inside MiniPay produces exactly one approval.

To disable the router later, revoke its two roles. That alone makes `claimAll` revert; the client falls back to the two-tx path once the env var is cleared.

### Funding the relayer

`0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83` pays gas for every sponsored mint on every chain. It is the single most common cause of "my hexes did not appear": the app looks healthy, the run closes, and nothing lands on-chain.

Failure signature in `railway logs --service cron-retry-unminted`:

```text
[onchain:hexes] captureBatch failed {
  error: 'The total cost (gas * gas fee + value) of executing this transaction
          exceeds the balance of the account.'
}
done: 0 chunks succeeded (0 hexes minted), 7 chunks failed
```

Check the balance directly:

```bash
RELAYER=0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83
cast balance "$RELAYER" --rpc-url https://forno.celo.org --ether
cast balance "$RELAYER" --rpc-url https://rpc.soneium.org --ether
```

Celo needs real attention because the base fee is 200 gwei, so a 0.01 CELO balance buys only ~55k gas, not even one `captureBatch`. Keep at least 2 CELO to cover sponsored mints plus headroom for a contract deploy. Soneium's base fee is ~0.001 gwei, so a small balance there lasts effectively forever.

There is no balance alarm today. Worth adding one.

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
