# MiniKlaim

> Run it. Klaim it.

A territory-capture running game where every block of your city you run through becomes yours. Built with Next.js and deployed on Celo.

Live: [www.miniklaim.fun](https://www.miniklaim.fun)

## How it works

The world is a grid of ~13-meter hexagons (H3 resolution 12). When you start a run, the app tracks your GPS path and claims every hex you pass through. Claimed hexes are minted as ERC-721 NFTs on Celo. If another runner crosses a hex you own, the contract transfers it to them, the only way to take it back is to run there yourself.

Achievements (First Steps, Mayor, Marathon, etc.) are tracked as soulbound ERC-1155 badges.

Gas is sponsored by the project, so you never sign anything beyond your normal wallet session.

## Contracts

Both games are deployed on each supported chain. `MiniKlaimHexes` (ERC-721
territory) and `MiniKlaimBadges` (ERC-1155 soulbound achievements) are
UUPS-upgradeable: **use the PROXY address** everywhere (env, Proof of Ship,
explorers); the implementation sits behind it. The same deployer/admin holds
`CAPTURER_ROLE` (Hexes) and `MINTER_ROLE` (Badges) on every chain and signs the
EIP-712 claim vouchers.

Admin / deployer / relayer (all chains): `0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83`

### Celo mainnet (chain 42220) — verified on Celoscan

| Contract        | Role             | Address                                      |
| --------------- | ---------------- | -------------------------------------------- |
| MiniKlaimHexes  | proxy (use this) | `0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B` |
| MiniKlaimHexes  | implementation   | `0x9Ae06a93154b6f54E4Ad44A2664b321AC68554EE` |
| MiniKlaimBadges | proxy (use this) | `0x79c5d6365f447d1F707EA6d4bDE5D6A96f181cf7` |
| MiniKlaimBadges | implementation   | `0x332D8Aa1B0CA847Fb7B95Ed020eF9600860ae406` |

### Soneium mainnet (chain 1868) — verified on Blockscout

| Contract        | Role             | Address                                      |
| --------------- | ---------------- | -------------------------------------------- |
| MiniKlaimHexes  | proxy (use this) | `0x4FE122eC088501Be53c5a12E1f0F313eD71AeB4C` |
| MiniKlaimHexes  | implementation   | `0xF5E2E7467E047e88e73048aE1520Ecf7ecAF19d9` |
| MiniKlaimBadges | proxy (use this) | `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8` |
| MiniKlaimBadges | implementation   | `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` |

> Note: some Soneium addresses coincide with old Celo addresses below. That is
> just the deployer reusing the same nonces on a fresh chain — they are distinct
> contracts on distinct chains.

### Legacy / abandoned (do NOT use)

Superseded by the upgradeable proxies above. Left here for history only.

| Contract                | Chain | Address                                      |
| ----------------------- | ----- | -------------------------------------------- |
| MiniKlaimHexes (legacy) | Celo  | `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` |
| MiniKlaimBadges (old)   | Celo  | `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8` |

## Tech

- Next.js 16 (App Router), React 19, Tailwind v4, MapLibre GL
- wagmi + viem; multichain (Celo via MiniPay/Farcaster, Soneium via Startale)
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
