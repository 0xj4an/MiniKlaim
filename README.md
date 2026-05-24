# MiniKlaim

> **Run it. Klaim it.** A run-to-own game on Celo, built for MiniPay.

Live: [miniklaim.fun](https://miniklaim.fun)

Every block of your city you run through becomes a verifiable on-chain asset. Free to play, no token, no NFT sneaker required. Just run.

## Status

| Layer                                                | State                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Core gameplay (GPS run, hex capture, real-time map)  | Live                                                                 |
| MiniPay integration (auto-connect, fee abstraction)  | Live                                                                 |
| HexNFT on Celo mainnet                               | Deployed and verified - `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` |
| Badges on Celo mainnet (ERC-1155 soulbound)          | In progress                                                          |
| Celo Proof of Ship submission                        | Target: 2026-05-29                                                   |
| MiniPay Stage 1 intake                               | Target: 2026-06-13                                                   |
| MiniPay Stage 2 listing                              | TBD post first call                                                  |

See [tasks/ROADMAP.md](tasks/ROADMAP.md) for the live plan.

## What it is, in one paragraph

MiniKlaim is the first run-to-own game built natively for MiniPay. We use H3 hex grids over the world map: every ~13-meter hex you pass through during a run becomes yours. Hex ownership is mirrored on-chain as ERC-721 NFTs, transferable only by the protocol (recaptures happen when another player runs through your hex). Achievement NFTs are ERC-1155 soulbound badges. Everything is free; gas is sponsored by the project. Identity is your MiniPay wallet plus an optional `@username`. No tokens, no investment, no IOUs.

## Why MiniPay

MiniPay has 14M+ wallets across 60+ countries, mostly emerging markets where running and walking are universal but app monetization is structurally hard. MiniKlaim leans into that: free to play, no purchase required, no crypto-native onboarding. The game does not need stablecoins to work; we are using MiniPay because:

1. **Distribution.** 14M wallets is the largest unaddressed audience in the Celo ecosystem.
2. **Frictionless onboarding.** Zero-click connect inside MiniPay - no signups, no key management.
3. **Locality.** MiniPay is strong in cities where a hex grid game has dense network effects (Lagos, Nairobi, Bogota, Buenos Aires).

The wedge: **free + local network effect + MiniPay-native.** No competitor in the MiniPay catalog matches all three. See [tasks/STRATEGY.md](tasks/STRATEGY.md) for positioning, GTM, and competitive analysis.

## Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind v4, MapLibre GL
- **Wallet:** wagmi + viem, `injected()` connector, Celo mainnet only
- **DB:** Postgres + PostGIS via Drizzle ORM
- **Contracts:** Solidity 0.8.28, Foundry, OpenZeppelin v5
- **Hosting:** Railway
- **Chain:** Celo L2 mainnet (chain id 42220)

Architecture detail: [tasks/TECH-SPEC.md](tasks/TECH-SPEC.md).

## Local development

```bash
# install
npm install
cd contracts && ./install-deps.sh && cd ..

# env
cp .env.example .env.local
# fill in DATABASE_URL, etc.

# db
npm run db:push
npm run db:seed:world   # seeds 64-city map

# dev server
npm run dev
```

Contracts:

```bash
cd contracts
forge test           # run all tests (currently 10/10 passing on HexNFT)
forge build
```

## Project layout

```text
app/                  Next.js routes (home, run, me, community, stats, etc.)
app/api/              Route handlers (REST)
contracts/            Foundry workspace (Solidity contracts + tests)
contracts/src/        MiniKlaimHexes.sol, MiniKlaimBadges.sol (WIP)
lib/                  Shared client + server libs
  wallet/             MiniPay detection, wagmi hooks
  db/                 Drizzle schema + migrations
  i18n*.ts            EN/ES dictionary
  logger.ts           Project logger (no console.log in feature code)
scripts/              One-off scripts (seed-world, etc.)
tasks/                Living planning docs
  ROADMAP.md          What we're shipping next
  STRATEGY.md         Product, market, business model, KPIs
  MINIPAY-LISTING.md  Gap analysis vs MiniPay listing requirements
  TECH-SPEC.md        Architecture, contracts, data flow, invariants
  IMPROVEMENTS.md     Prioritized backlog (P0-P3)
```

## Documentation index

- [tasks/ROADMAP.md](tasks/ROADMAP.md) - current sprint plan
- [tasks/STRATEGY.md](tasks/STRATEGY.md) - CEO-level positioning, market, KPIs
- [tasks/MINIPAY-LISTING.md](tasks/MINIPAY-LISTING.md) - listing readiness checklist
- [tasks/TECH-SPEC.md](tasks/TECH-SPEC.md) - architecture and contract notes
- [tasks/IMPROVEMENTS.md](tasks/IMPROVEMENTS.md) - prioritized backlog
- [JOURNAL.md](JOURNAL.md) - local dev journal (gitignored)

## License

[MIT](LICENSE) (c) 2026 0xj4an
