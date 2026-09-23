# MiniKlaim contracts

Foundry workspace for the on-chain half of MiniKlaim.

This file covers **working in this workspace**: installing, building, testing, formatting. It deliberately holds no addresses, role tables or upgrade procedures, because those are reference material with exactly one home:

- [../docs/CONTRACTS.md](../docs/CONTRACTS.md) - contract catalog, deployed addresses, roles, provenance, attribution, fee abstraction, upgrade model.
- [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) - the deploy and upgrade playbook (env, RPC, verifier, role grants, relayer funding).
- [../SECURITY.md](../SECURITY.md) - audit status, trust model, disclosure.

## Contracts in this workspace

| File                           | Purpose                                                                                                                  | Upgradeable   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `src/MiniKlaimHexes.sol`       | ERC-721 territory NFT. Player captures a hex, contract mints or transfers.                                               | UUPS          |
| `src/MiniKlaimBadges.sol`      | ERC-1155 soulbound achievements (55 badges, 8 categories).                                                               | UUPS          |
| `src/MiniKlaimRewards.sol`     | USDm reward vault with EIP-712 voucher claim. Pausable.                                                                  | UUPS          |
| `src/MiniKlaimClaimRouter.sol` | Settles a run's hexes and badges in one tx so the player approves once. Holds mint authority on the two token contracts. | No, by design |

Deployment status per chain lives in [../docs/CONTRACTS.md](../docs/CONTRACTS.md), not here, so there is one place to update when something ships.

## Setup

Install Foundry:

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

Install this workspace's dependencies (vendored under `lib/`):

```bash
./install-deps.sh
```

## Commands

```bash
forge build                                         # compile everything
forge test                                          # run all suites
forge test -vv                                      # more verbose
forge test --match-contract MiniKlaimHexes -vv      # one contract
forge test --match-contract MiniKlaimClaimRouter    # the combined-claim router
forge test --gas-report                             # gas snapshot per fn
forge fmt                                           # format
forge lint                                          # style + gas notes
```

`forge test` is the source of truth for how many tests exist and whether they pass. A per-suite breakdown snapshot lives in [../docs/CONTRACTS.md](../docs/CONTRACTS.md#testing).

## Deploying

Do not improvise a deploy from this file. The playbook, including the role grants the claim router needs and the relayer-funding check that has bitten us before, is in [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md#contract-deployment).

## Foundry config

- `foundry.toml` at the workspace root. Solidity 0.8.28 compiler, `pragma ^0.8.24` in sources, optimizer on at 200 runs.
- OpenZeppelin v5 (`openzeppelin-contracts`, `openzeppelin-contracts-upgradeable`) and `forge-std`, vendored under `lib/`.
- RPC aliases (`celo`, `alfajores`, `soneium`) and verifier config are defined there, so `--rpc-url celo` works without a URL.
- Build output under `out/`, deploy history under `broadcast/`, both gitignored.
