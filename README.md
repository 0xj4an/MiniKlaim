# MiniKlaim

> Run it. Klaim it.

A territory-capture running game. Every block of your city you run through becomes yours on a shared map. Built with Next.js, deployed on Celo (and Soneium).

Live: [www.miniklaim.fun](https://www.miniklaim.fun)

## How it works

The world is a grid of ~13-meter hexagons (H3 resolution 12). When you start a run, the app tracks your GPS path and claims every hex you pass through. Claimed hexes are minted as ERC-721 NFTs on Celo. If another runner crosses a hex you own, the contract transfers it to them. The only way to take it back is to run there yourself.

Achievements (First Steps, Mayor, Marathon, and 52 more) are tracked as soulbound ERC-1155 badges across 8 categories.

Gas is sponsored by the project when needed, so you never have to think about it. When you do sign a transaction, it can be paid in USDm, USDC, or USDT via Celo fee abstraction.

## Documentation

- **[Architecture](docs/ARCHITECTURE.md)** - system diagram, layers, cross-cutting concerns.
- **[Contracts](docs/CONTRACTS.md)** - addresses, roles, upgrade model, fee abstraction.
- **[API](docs/API.md)** - REST endpoint reference.
- **[Local development](docs/LOCAL-DEV.md)** - full setup guide.
- **[Deployment](docs/DEPLOYMENT.md)** - Railway + Foundry playbook.
- **[Security](SECURITY.md)** - audit status, threat model, disclosure policy.
- **[Contributing](CONTRIBUTING.md)** - how to submit issues and pull requests.
- **[Code of Conduct](CODE_OF_CONDUCT.md)** - community standards.
- **[Changelog](CHANGELOG.md)** - notable user-facing changes.

## Tech stack

- Next.js 16 (App Router) + React 19 + Tailwind v4 + MapLibre GL
- wagmi + viem, multichain (Celo via MiniPay / Farcaster, Soneium via Startale)
- Postgres via Drizzle ORM
- Solidity 0.8.24, Foundry, OpenZeppelin v5, UUPS proxies
- ERC-8021 attribution tags on every Celo write tx
- Hosted on Railway

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
docs/               Public documentation
.github/            CI, PR + issue templates
```

## Contracts

Verified on-chain. See [docs/CONTRACTS.md](docs/CONTRACTS.md) for the full table with roles, ABIs, and upgrade notes.

**Celo mainnet (chain 42220)**:

- MiniKlaimHexes proxy: `0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B`
- MiniKlaimBadges proxy: `0x79c5d6365f447d1F707EA6d4bDE5D6A96f181cf7`

**Soneium mainnet (chain 1868)**:

- MiniKlaimHexes proxy: `0x4FE122eC088501Be53c5a12E1f0F313eD71AeB4C`
- MiniKlaimBadges proxy: `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8`

Admin / deployer / relayer (all chains): `0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83`

## Security

**Unaudited software. Use at your own risk.** See [SECURITY.md](SECURITY.md) for the full threat model, in-scope / out-of-scope items, and disclosure policy.

**Do not open public issues for security vulnerabilities.**

## License

[MIT](LICENSE) (c) 2026 0xj4an
