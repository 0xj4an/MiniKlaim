# MiniKlaim contracts

Foundry workspace for the on-chain half of MiniKlaim. See [../docs/CONTRACTS.md](../docs/CONTRACTS.md) for addresses, roles, and architecture. See [../SECURITY.md](../SECURITY.md) for security posture.

## Contracts in this workspace

| File | Purpose | Status |
|---|---|---|
| `src/MiniKlaimHexes.sol` | ERC-721 territory NFT. Player captures a hex, contract mints or transfers. UUPS-upgradeable. | Deployed Celo + Soneium |
| `src/MiniKlaimBadges.sol` | ERC-1155 soulbound achievements (55 badges, 8 categories). UUPS-upgradeable. | Deployed Celo + Soneium |
| `src/MiniKlaimRewards.sol` | USDm reward vault with EIP-712 voucher claim. Pausable, UUPS-upgradeable. | Not deployed. Activation deferred until MiniPay Stage 2 listing. |

## Setup

Install Foundry:

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

Install this workspace's dependencies (vendored via git submodules, script wraps the setup):

```bash
./install-deps.sh
```

## Commands

```bash
forge build                                         # compile everything
forge test                                          # run all suites
forge test -vv                                      # more verbose
forge test --match-contract MiniKlaimHexes -vv      # one contract
forge test --gas-report                             # gas snapshot per fn
forge fmt                                           # format
```

## Test suites

- `test/MiniKlaimHexes.t.sol`
- `test/MiniKlaimBadges.t.sol`
- `test/MiniKlaimRewards.t.sol` (21 tests)

Current suite passes 57/57 across all three.

## Deploying

See [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) for the full deploy playbook (env vars, RPC URLs, verifier config).

Deploy scripts:

```
script/DeployHexes.s.sol
script/DeployBadges.s.sol
script/DeployRewards.s.sol   # deferred, ready
```

All three read `SERVER_SIGNER_PRIVATE_KEY` from env and deploy the implementation + ERC1967Proxy in a single broadcast. The deployer becomes `DEFAULT_ADMIN_ROLE` + the operational role on the new contract.

Quick reference for Celo mainnet:

```bash
set -a; source ../.env.local; set +a
forge script script/DeployHexes.s.sol:DeployHexes \
  --rpc-url https://forno.celo.org \
  --broadcast --slow --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --verifier-url "https://api.celoscan.io/api"
```

## Upgrading

UUPS upgrade path is a single tx from the `DEFAULT_ADMIN_ROLE` holder:

```bash
cast send <PROXY_ADDRESS> \
  "upgradeToAndCall(address,bytes)" \
  <NEW_IMPLEMENTATION_ADDRESS> 0x \
  --rpc-url https://forno.celo.org \
  --private-key "$SERVER_SIGNER_PRIVATE_KEY"
```

**Storage layout preservation**: each contract reserves a `__gap` array. When you add state, reduce the gap by the same number of slots. See OpenZeppelin's [upgradeable contracts guide](https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable) for details.

## Audit status

**Unaudited.** See [../SECURITY.md](../SECURITY.md) for the full disclosure model and known risks.

## Foundry config

- `foundry.toml` at the workspace root. Solidity 0.8.24, OpenZeppelin v5, `forge-std` for tests.
- Compilation output under `out/` (gitignored).
- Broadcast artifacts under `broadcast/` (gitignored, contains chain-scoped deploy history).
- Dependencies vendored under `lib/` (`openzeppelin-contracts`, `openzeppelin-contracts-upgradeable`, `forge-std`).
