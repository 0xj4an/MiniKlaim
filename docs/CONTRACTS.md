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

## Deployed addresses

The admin, deployer, and relayer are the same externally-owned account on every chain:

**Admin / deployer / relayer**: `0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83`

Single-key model. No multisig, no timelock.

### Celo mainnet (chain 42220) — verified on Celoscan

Use the PROXY address in env, dApps, explorers. The implementation address is deployed alongside for the UUPS proxy delegatecall target only.

| Contract | Role | Address |
|---|---|---|
| MiniKlaimHexes | proxy | `0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B` |
| MiniKlaimHexes | implementation | `0x9Ae06a93154b6f54E4Ad44A2664b321AC68554EE` |
| MiniKlaimBadges | proxy | `0x79c5d6365f447d1F707EA6d4bDE5D6A96f181cf7` |
| MiniKlaimBadges | implementation | `0x332D8Aa1B0CA847Fb7B95Ed020eF9600860ae406` |
| MiniKlaimRewards | proxy | (not deployed) |

### Soneium mainnet (chain 1868) — verified on Blockscout

| Contract | Role | Address |
|---|---|---|
| MiniKlaimHexes | proxy | `0x4FE122eC088501Be53c5a12E1f0F313eD71AeB4C` |
| MiniKlaimHexes | implementation | `0xF5E2E7467E047e88e73048aE1520Ecf7ecAF19d9` |
| MiniKlaimBadges | proxy | `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8` |
| MiniKlaimBadges | implementation | `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` |

Some Soneium addresses collide with legacy Celo addresses. That is just the deployer reusing the same nonces on a fresh chain. They are distinct contracts on distinct chains.

### Legacy Celo addresses (do NOT use)

Superseded by the upgradeable proxies above. Kept here for historical reference only.

| Contract | Chain | Address |
|---|---|---|
| MiniKlaimHexes (legacy) | Celo | `0xf3C18ECFFEcca156E681cf1Ebfa37cA68c42cb47` |
| MiniKlaimBadges (legacy) | Celo | `0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8` |

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

Current suite: 57 passing across `MiniKlaimHexes.t.sol` (35), `MiniKlaimBadges.t.sol` (unstated in repo), and `MiniKlaimRewards.t.sol` (21).

## Deployment

Foundry scripts under `contracts/script/`:

- `DeployHexes.s.sol`
- `DeployBadges.s.sol`
- `DeployRewards.s.sol` (dormant, ready for MiniPay Stage 2)

Each reads `SERVER_SIGNER_PRIVATE_KEY` from env and deploys the implementation + ERC1967Proxy in a single transaction. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full sequence.

## Upgrading

Because all three contracts are UUPS, the upgrade is a single tx from the `DEFAULT_ADMIN_ROLE` holder:

```solidity
// From a UUPS-aware wallet or foundry script
UUPSUpgradeable(proxy).upgradeToAndCall(newImplementation, "")
```

Storage layout must be preserved. Each contract reserves a `__gap` array for future variables (`uint256[45] __gap` in Hexes, similar in others). When you add a new state variable, reduce the gap by the same slot count.
