# MiniKlaim

> Run it. Klaim it.

A territory-capture running game where every block of your city you run through becomes yours. Built with Next.js and deployed on Celo.

Live: [www.miniklaim.fun](https://www.miniklaim.fun)

## How it works

The world is a grid of ~13-meter hexagons (H3 resolution 12). When you start a run, the app tracks your GPS path and claims every hex you pass through. Claimed hexes are minted as ERC-721 NFTs on Celo. If another runner crosses a hex you own, the contract transfers it to them, the only way to take it back is to run there yourself.

Achievements (First Steps, Mayor, Marathon, etc.) are tracked as soulbound ERC-1155 badges.

Gas is sponsored by the project, so you never sign anything beyond your normal wallet session.

## Contracts (Celo mainnet, chain 42220)

| Contract                             | Address                                      |
| ------------------------------------ | -------------------------------------------- |
| MiniKlaimHexes (ERC-721)             | `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` |
| MiniKlaimBadges (ERC-1155 soulbound) | `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8` |

Both verified on Celoscan.

## Tech

- Next.js 16 (App Router), React 19, Tailwind v4, MapLibre GL
- wagmi + viem; Celo mainnet only
- Postgres + PostGIS via Drizzle ORM
- Solidity 0.8.28, Foundry, OpenZeppelin v5
- Hosted on Railway

Works with any injected wallet. Auto-connects inside MiniPay and inside Farcaster Mini App hosts (via the official `@farcaster/miniapp-wagmi-connector`).

## Local development

```bash
npm install
cd contracts && ./install-deps.sh && cd ..

cp .env.example .env.local
# fill in DATABASE_URL and contract addresses

npm run db:push
npm run db:seed:world

npm run dev
```

Contracts:

```bash
cd contracts
forge test
forge build
```

## Project layout

```text
app/              Next.js routes
app/api/          Route handlers
contracts/        Foundry workspace
contracts/src/    MiniKlaimHexes.sol, MiniKlaimBadges.sol
lib/
  wallet/         Wallet detection + wagmi hooks
  onchain/        Contract clients (viem)
  db/             Drizzle schema + migrations
  i18n*.ts        EN / ES strings
  logger.ts       Project logger (do not use raw console.log)
scripts/          One-off scripts (seed-world, etc.)
```

## License

[MIT](LICENSE) (c) 2026 0xj4an
