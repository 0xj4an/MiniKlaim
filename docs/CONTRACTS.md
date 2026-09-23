# Contracts

All MiniKlaim smart contracts, their addresses, roles, and upgrade model. For high-level architecture see [ARCHITECTURE.md](ARCHITECTURE.md). For security details see [SECURITY.md](../SECURITY.md).

**Audit status: unaudited. Use at your own risk.**

## Contract catalog

### `MiniKlaimHexes` (ERC-721, upgradeable)

Territory NFT. Each captured H3 hex (resolution 12, ~13m across) is a token whose `tokenId` equals the raw H3 cell index cast to `uint256`.

Non-transferable by players. The contract itself moves ownership when a hex is recaptured by another player.

Two capture paths:
- `capture(address, uint256)` and `captureBatch(address, uint256[])`: backend relayer (`CAPTURER_ROLE`) mints or transfers. Used as the sponsored fallback when the player cannot pay gas.
- `claimRun(uint256[], uint256 nonce, bytes sig)`: called by the player from their own wallet, gated by an EIP-712 voucher signed by `CAPTURER_ROLE`. Player becomes the on-chain `msg.sender`.

Roles:
- `DEFAULT_ADMIN_ROLE`: upgrade + role management.
- `CAPTURER_ROLE`: sign vouchers, submit captures.

### `MiniKlaimBadges` (ERC-1155, soulbound, upgradeable)

Achievement badges. 55 badges across 8 categories (Territory, Runs, Single-run feats, Distance, Streaks, Cities, Conquest, Countries).

Soulbound: `_update` reverts on any non-mint transfer.

Two mint paths mirroring Hexes:
- `mintBatch(address, uint256[])`: relayer.
- `claimBadges(uint256[], uint256 nonce, bytes sig)`: player with EIP-712 voucher signed by `MINTER_ROLE`.

Roles:
- `DEFAULT_ADMIN_ROLE`: upgrade + role management.
- `MINTER_ROLE`: sign vouchers, submit mints.

### `MiniKlaimRewards` (upgradeable) - DORMANT

USDm reward vault. Ships in the codebase but not deployed. Activation deferred until MiniKlaim is officially listed in MiniPay Stage 2.

When activated: player calls `claimRewards(uint256[] badgeIds, uint256 nonce, bytes sig)` with an EIP-712 voucher signed by `REWARDER_ROLE` (backend). Contract transfers configured USDm amount per badge. One-shot per (player, badge). Pausable.

Roles:
- `DEFAULT_ADMIN_ROLE`: upgrade + fund + configure amounts + pause + emergency withdraw.
- `REWARDER_ROLE`: sign claim vouchers.

### `MiniKlaimClaimRouter` (NOT upgradeable) - NOT YET DEPLOYED

Settles a finished run in a single transaction, so the player sees one wallet approval instead of two.

MiniPay injects a plain EIP-1193 provider with no EIP-5792 (`wallet_sendCalls`), so there is no wallet-level way to bundle calls. One approval therefore means one transaction, and a run settles across two contracts. `claimRun` and `claimBadges` cannot be wrapped because both bind the recipient to `msg.sender`, so a router calling them would mint to itself. The relayer entry points take the recipient explicitly, so the router holds `CAPTURER_ROLE` on Hexes and `MINTER_ROLE` on Badges and calls `captureBatch(msg.sender, ...)` plus `mintBatch(msg.sender, ...)`. No upgrade to either live contract, no address change.

`claimAll(uint256[] h3Ids, uint256[] badgeIds, uint256 nonce, bytes sig)`: one EIP-712 voucher signed by `VOUCHER_SIGNER_ROLE` authorises both lists. The voucher binds `msg.sender`, so one player's voucher is useless to another, and both id lists are hashed into it so neither can be padded. Either list may be empty, not both.

Deliberately **not** upgradeable, unlike the other three. It is the only contract besides the backend signer key that holds mint authority, so its logic is fixed at deploy time and no admin can repoint it at a different recipient. To retire it, revoke its two roles (that alone disables it) and deploy a replacement. Voucher nonces here are gas hygiene rather than a safety boundary: `_capture` and `_unlock` are both no-ops for something the player already holds, so a replayed voucher mints nothing extra.

Roles:
- `DEFAULT_ADMIN_ROLE`: role management only (no upgrade path exists).
- `VOUCHER_SIGNER_ROLE`: the backend key whose vouchers the router accepts.

Own metrics: `totalClaims`, `uniqueClaimers`. Hexes counts only its own `claimRun` entry point, so combined claims are invisible to `totalClaimRuns`; [`lib/onchain/metrics.ts`](../lib/onchain/metrics.ts) folds the router tally into the reported `claimRuns` so /stats does not undercount.

Client gate: `NEXT_PUBLIC_<CHAIN>_CLAIM_ROUTER_ADDRESS`. Unset means the app falls back to the two-tx `claimRun` + `claimBadges` path, so the code is safe to ship before the deploy.

## Deployed addresses

The admin, deployer, and relayer are the same externally-owned account on every chain:

**Admin / deployer / relayer**: `0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83`

Single-key model. No multisig, no timelock.

That account also pays gas for every sponsored mint. When its balance runs out the sponsored fallback and the `cron-retry-unminted` job both fail with "The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account", and player hexes silently stop reaching the chain. See [DEPLOYMENT.md](DEPLOYMENT.md#funding-the-relayer) for the funding runbook.

Every contract listed below was deployed by that account. Verified by enumerating its full transaction history on both chains, not by trusting this file: 6 contract creations on Celo, 4 on Soneium, 10 in total, all accounted for here. `cast code` returns `0x` for the account on both chains, so it is a plain EOA, not a Safe or a timelock.

### Celo mainnet (chain 42220) - verified on Celoscan

Use the PROXY address in env, dApps, explorers. The implementation address is deployed alongside for the UUPS proxy delegatecall target only.

| Contract | Role | Address | Block | Deployed |
|---|---|---|---|---|
| MiniKlaimHexes | proxy | `0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B` | 69727199 | 2026-06-16 |
| MiniKlaimHexes | implementation | `0x9Ae06a93154b6f54E4Ad44A2664b321AC68554EE` | 69727198 | 2026-06-16 |
| MiniKlaimBadges | proxy | `0x79c5d6365f447d1F707EA6d4bDE5D6A96f181cf7` | 69759385 | 2026-06-17 |
| MiniKlaimBadges | implementation | `0x332D8Aa1B0CA847Fb7B95Ed020eF9600860ae406` | 69759385 | 2026-06-17 |
| MiniKlaimRewards | proxy | (not deployed) | - | - |
| MiniKlaimClaimRouter | single (no proxy) | (not deployed) | - | - |

Creation transactions:

- Hexes proxy: `0xe2a3c853929d23ee74e3f474f62aaecf904c1debf09991a1a24cc6b8fc64eca8`
- Hexes implementation: `0x3afaf852c0baec8004f5be83c438fdce515359caa4a836225c8d461c37456a55`
- Badges proxy: `0xf839c9bbffbc217cd9c16bc9f32cf3779a377099b6da3d1cb5876d715726ad83`
- Badges implementation: `0x2edc0b150e647d1709fddabf05ef78586737d95b352d3efc83c6f9db21ea5533`

### Soneium mainnet (chain 1868) - verified on Blockscout

| Contract | Role | Address | Block | Deployed |
|---|---|---|---|---|
| MiniKlaimHexes | proxy | `0x4FE122eC088501Be53c5a12E1f0F313eD71AeB4C` | 24267464 | 2026-06-17 |
| MiniKlaimHexes | implementation | `0xF5E2E7467E047e88e73048aE1520Ecf7ecAF19d9` | 24267464 | 2026-06-17 |
| MiniKlaimBadges | proxy | `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8` | 24267413 | 2026-06-17 |
| MiniKlaimBadges | implementation | `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` | 24267413 | 2026-06-17 |

Creation transactions:

- Hexes proxy: `0x926124df838b00855306005d6227fcbc69926e5a67e121ed7170f8ae45e4b9fb`
- Hexes implementation: `0x197697a4039fa348963fb5224f8e95c3c75f4f09782f44994d6eb5a0dfdfee3e`
- Badges proxy: `0x7b2b361683dd14b5fd1f6381351860f2c290be284ba8969418956eee55ad70ed`
- Badges implementation: `0x6c1592d19c046812507fe6e6d9a568f18f6231582d81978b325a2771b283ec1e`

Two Soneium addresses are byte-identical to the two legacy Celo addresses below. That is the deployer replaying the same nonce sequence on a fresh chain, so CREATE produced the same addresses:

| Address | On Celo | On Soneium |
|---|---|---|
| `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8` | legacy MiniKlaimBadges, abandoned | MiniKlaimBadges proxy, **live** |
| `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` | legacy MiniKlaimHexes, abandoned | MiniKlaimBadges implementation, **live** |

Different bytecode, different chains, different roles. Confirmed: `totalBadgesMinted()` on `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8` reverts on Celo and returns a value on Soneium. Treat this as a copy-paste hazard when editing per-chain config: the wrong address will exist and answer calls instead of failing loudly.

### Legacy Celo contracts (do NOT use, but they are still live)

The first generation on Celo was deployed **without proxies**, as direct non-upgradeable instances. The June 2026 redeploy moved to UUPS proxies and re-minted the ownership into them via `adminImport`, so players did not lose territory. The originals were never destroyed and still hold the tokens minted before the migration.

| Contract | Address | Standard | Block | Deployed | Holders | Transfers |
|---|---|---|---|---|---|---|
| MiniKlaimHexes (legacy) | `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` | ERC-721 | 67570693 | 2026-05-22 | 6 | 148 |
| MiniKlaimBadges (legacy) | `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8` | ERC-1155 | 67756595 | 2026-05-24 | 10 | 17 |

Creation transactions:

- Hexes (legacy): `0x1b84ec6172f7ca8ab0294d00f88a887ba68bd8990ff6e91939c2472792fae6fb`
- Badges (legacy): `0x04c062797cd2ad051aefca327d66618cdc3834c89ee5e21b78f3d59ff0c7f1d6`

Both are still verified on Celoscan, so those orphaned tokens remain visible in player wallets and on marketplaces. Neither appears in any env var, so the app never reads them.

They predate the on-chain metrics counters: `totalCaptures()`, `uniquePlayers()`, `totalClaimRuns()` and `totalBadgesMinted()` all revert on them, while `name()` still answers. Do not point a dashboard or a metrics reader at these.

### Role and upgrade history

Audited from the full event history of all four live proxies, using the explorers' server-side topic filter (paginating the v2 logs endpoint gives up long before reaching the deploy block on Hexes, which has 13k+ captures):

- **`RoleGranted`: exactly 2 per proxy**, both to the deployer, both in the deploy transaction. No third party has ever held a role on any of them.
- **`RoleRevoked`: zero, ever, on any contract.**
- **`Upgraded`: exactly 1 per proxy**, the initial one. No contract has ever been upgraded, so every implementation listed above is the original.

Re-verify at any time:

```bash
cast call <PROXY> 'hasRole(bytes32,address)(bool)' \
  0x0000000000000000000000000000000000000000000000000000000000000000 \
  0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83 \
  --rpc-url https://forno.celo.org
```

## Attribution

All player-submitted and relayer transactions carry an ERC-8021 attribution suffix appended to calldata via `@celo/attribution-tags` (code: `miniklaim`). See [`lib/onchain/attribution.ts`](../lib/onchain/attribution.ts).

## Fee abstraction

On Celo, transactions can pay gas in USDm, USDC, or USDT via CIP-64 fee-currency adapters:

| Symbol | Token address | Adapter address |
|---|---|---|
| USDm | `0x765DE816845861e75A25fCA122bb6898B8B1282a` | (self-adapting) |
| USDC | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B` |
| USDT | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | `0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72` |

`pickFeeAdapter(feeCurrencies, balances)` in [`lib/onchain/chains.ts`](../lib/onchain/chains.ts) selects the first adapter for a token the player holds. Falls back to native currency (or the sponsored relayer path) if the player holds none of them.

Soneium does not have Mento fee-currency adapters; players pay gas in the native token there.

## Testing

```bash
cd contracts
forge build
forge test                        # all suites
forge test --match-contract MiniKlaimHexes -vv
forge test --match-contract MiniKlaimRewards --gas-report
```

Current suite: 74 passing across four files.

| File | Tests |
|---|---|
| `MiniKlaimHexes.t.sol` | 19 |
| `MiniKlaimBadges.t.sol` | 17 |
| `MiniKlaimRewards.t.sol` | 21 |
| `MiniKlaimClaimRouter.t.sol` | 17 |

## Deployment

Foundry scripts under `contracts/script/`:

- `DeployHexes.s.sol`
- `DeployBadges.s.sol`
- `DeployRewards.s.sol` (dormant, ready for MiniPay Stage 2)
- `DeployClaimRouter.s.sol` (not yet run on any chain)

The first three read `SERVER_SIGNER_PRIVATE_KEY` from env and deploy the implementation + ERC1967Proxy in a single transaction.

`DeployClaimRouter.s.sol` is different: no proxy, and it additionally performs the three role grants the router needs (`VOUCHER_SIGNER_ROLE` on itself to the signer, `CAPTURER_ROLE` on Hexes and `MINTER_ROLE` on Badges to the router), because a router without them is inert and the grants are easy to forget. It takes the target addresses explicitly via `HEXES_ADDRESS` and `BADGES_ADDRESS`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full sequence.

## Upgrading

`MiniKlaimHexes`, `MiniKlaimBadges` and `MiniKlaimRewards` are UUPS, so an upgrade is a single tx from the `DEFAULT_ADMIN_ROLE` holder. `MiniKlaimClaimRouter` has no upgrade path by design; replacing it means deploying a new one, granting it the two roles and revoking them from the old one.

```solidity
// From a UUPS-aware wallet or foundry script
UUPSUpgradeable(proxy).upgradeToAndCall(newImplementation, "")
```

Storage layout must be preserved. Each contract reserves a `__gap` array for future variables (`uint256[45] __gap` in Hexes, similar in others). When you add a new state variable, reduce the gap by the same slot count.
