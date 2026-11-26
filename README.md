# MiniKlaim

> Run it. Klaim it.

A territory-capture game. Every block of your city you cross - on foot, by bike, in a car, on a plane - becomes yours on a shared map. Built with Next.js, deployed on Celo (and Soneium).

Live: [www.miniklaim.fun](https://www.miniklaim.fun)

## How it works

The world is a grid of ~13-meter hexagons (H3 resolution 12). When you start a run, the app tracks your GPS path and claims every hex you pass through. Any mode of movement counts - walk, run, bike, drive, fly. Claimed hexes are recorded on Celo in one approval per run, and you can turn yours into ERC-721 NFTs from your profile whenever you like. If another player crosses a hex you own, it becomes theirs (an NFT moves with it). The only way to take it back is to go there yourself.

Achievements (First Steps, Mayor, Marathon, and 52 more) are tracked as soulbound ERC-1155 badges across 8 categories.

Recording a run on-chain is paid by the project's relayer whenever it can, so most players never see a fee. Turning blocks into NFTs is the player's own purchase: the app shows the fee before you sign, offers a batch your balance covers when the whole one does not, and mints up to 100 a day for free when you cannot pay at all. When you do sign a transaction, the fee can be paid in USDm, USDC, or USDT via Celo fee abstraction.

## Documentation

- **[Documentation index](docs/README.md)** - what each document owns, and which one to trust.
- **[Architecture](docs/ARCHITECTURE.md)** - system diagram, layers, cross-cutting concerns.
- **[Contracts](docs/CONTRACTS.md)** - addresses, roles, provenance, upgrade model, fee abstraction.
- **[Contracts workspace](contracts/README.md)** - Foundry setup, build, test, lint.
- **[API](docs/API.md)** - REST endpoint reference.
- **[Local development](docs/LOCAL-DEV.md)** - full setup guide.
- **[Deployment](docs/DEPLOYMENT.md)** - production env vars, contract deploys, relayer funding, rollback.
- **[VPS operations](ops/README.md)** - how production runs: rolling deploys, the scheduled jobs, the proxy in front.
- **[Security](SECURITY.md)** - audit status, threat model, disclosure policy.
- **[Contributing](CONTRIBUTING.md)** - how to submit issues and pull requests.
- **[Code of Conduct](CODE_OF_CONDUCT.md)** - community standards.
- **[Changelog](CHANGELOG.md)** - notable user-facing changes.

## Tech stack

- Next.js 16 (App Router) + React 19 + Tailwind v4 + MapLibre GL
- wagmi + viem, multichain (Celo via MiniPay / Farcaster, Soneium via Startale)
- Postgres via Drizzle ORM
- Solidity 0.8.24, Foundry, OpenZeppelin v5, UUPS proxies (the claim router is intentionally non-upgradeable)
- ERC-8021 attribution tags on every Celo write tx
- Self-hosted on a VPS with Docker Compose: Caddy in front of two app containers (primary and standby) and Postgres with PostGIS + H3. Merges to `main` deploy themselves through [`ops/deploy.sh`](ops/deploy.sh)
- Sentry for errors, PostHog for product analytics

Works with any injected wallet. Auto-connects inside MiniPay and inside Farcaster Mini App hosts (via the official `@farcaster/miniapp-wagmi-connector`) and Startale Soneium accounts.

## Quick setup

```bash
npm install
cd contracts && ./install-deps.sh && cd ..

cp .env.example .env.local
# fill in DATABASE_URL and contract addresses

npm run db:push
npm run db:seed:world  # optional: populate world map with sample territory

npm run dev
```

Contracts:

```bash
cd contracts
forge test
forge build
```

Full setup, including Postgres + PostGIS + H3 extension setup, ngrok for MiniPay testing, and env-var reference: [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md).

## Project layout

```text
app/                Next.js routes (Server + Client Components)
app/api/            Route handlers
contracts/          Foundry workspace (Solidity, tests, deploy scripts)
lib/
  wallet/           Wallet detection + wagmi hooks
  onchain/          Contract clients (viem)
  runs/             Run validation + streak calculation
  db/               Drizzle schema + migrations
  map/              H3 hex helpers, MapLibre config
  i18n*.ts          EN / ES strings
  logger.ts         Project logger (do not use raw console.log)
scripts/            One-off + cron scripts
ops/                Production deploy script and VPS runbook
docs/               Public documentation
.github/            CI, PR + issue templates
```

## Contracts

Two token contracts per chain, live and verified on Celo mainnet and Soneium mainnet:

- `MiniKlaimHexes` - territory record per H3 hex; a hex becomes an ERC-721 token when its owner mints it (v2, Oct 2026; every hex settled before then is already a token).
- `MiniKlaimBadges` - ERC-1155 soulbound achievements.

A third, `MiniKlaimClaimRouter`, settles a whole run in one wallet approval and is live on Celo mainnet. `MiniKlaimRewards` is written and tested but dormant.

Addresses, deploy provenance, roles and the upgrade model live in one place so they cannot drift: **[docs/CONTRACTS.md](docs/CONTRACTS.md)**. Deploying or upgrading anything goes through **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Status and open work

The game is live and in daily use. What is known to be incomplete, so nobody has to rediscover it:

- **Runs stop recording when the app goes to the background.** Browsers and in-wallet webviews do not deliver GPS to a page you cannot see. The fix is native background location in the wallet; requested from MiniPay in [celo-org/minipay#46](https://github.com/celo-org/minipay/issues/46), with iOS location inside MiniPay in [#44](https://github.com/celo-org/minipay/issues/44).
- **Linking two wallets to one player is waiting on MiniPay.** The flow is built and documented in [docs/API.md](docs/API.md#cross-wallet-linking); the redemption step needs a wallet capability MiniPay does not offer yet.
- **The relayer has a floor.** Below a set balance it stops paying for run claims, players pay their own gas until it is funded again, and an alert fires. `/api/health` reports the balance and whether claims are being sponsored.
- **The server occasionally pauses for one to seven seconds.** Measured, and ruled out so far: our own code blocking, garbage collection, and swap. Still under investigation.
- **`MiniKlaimRewards` is written and tested but not deployed.** See [docs/CONTRACTS.md](docs/CONTRACTS.md).

## Security

**Unaudited software. Use at your own risk.** See [SECURITY.md](SECURITY.md) for the full threat model, in-scope / out-of-scope items, and disclosure policy.

**Do not open public issues for security vulnerabilities.**

## License

[MIT](LICENSE) (c) 2026 0xj4an
