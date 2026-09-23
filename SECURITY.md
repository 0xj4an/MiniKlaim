# Security

**MiniKlaim is unaudited software. Use at your own risk.**

## Audit status

The smart contracts (`MiniKlaimHexes`, `MiniKlaimBadges`, the undeployed `MiniKlaimClaimRouter`, and the deferred `MiniKlaimRewards`) have not undergone formal audit. No security firm has reviewed the code. Bugs, exploits, and funds loss are possible.

The contracts are deployed under the MIT license. There is no warranty (see [LICENSE](LICENSE)). Interact only with values you are willing to lose.

## Architecture facts security reviewers should know

- **The token contracts are UUPS-upgradeable.** The `DEFAULT_ADMIN_ROLE` holder can upgrade `MiniKlaimHexes`, `MiniKlaimBadges` and `MiniKlaimRewards` to arbitrary logic. Currently a single externally-owned account (see [docs/CONTRACTS.md](docs/CONTRACTS.md) for the address). No multisig, no timelock, no governance module.
- **`MiniKlaimClaimRouter` is deliberately not upgradeable.** It holds mint authority on both token contracts, so its logic is fixed at deploy time and no admin can repoint it at a recipient other than the caller. It is disabled by revoking its two roles, not by upgrading it. It exposes no function that mints to an arbitrary address.
- **The same account also holds operational roles** on every contract:
  - `CAPTURER_ROLE` on `MiniKlaimHexes` (can mint or transfer any hex).
  - `MINTER_ROLE` on `MiniKlaimBadges` (can mint any badge to any address).
  - (Future) `REWARDER_ROLE` on `MiniKlaimRewards` (can sign reward vouchers).
  - (Future) `VOUCHER_SIGNER_ROLE` on `MiniKlaimClaimRouter` (can authorise combined claims). The router itself holds `CAPTURER_ROLE` and `MINTER_ROLE` once deployed, making it a second holder of mint authority alongside this key.
- **The same private key runs the backend relayer** and lives in the Railway environment. Compromise of that key allows arbitrary mint, upgrade, and (when rewards are activated) drain of the USDm pool.
- **Player-submitted transactions are gated by EIP-712 vouchers** signed by the backend. Nonces prevent replay; role membership gates voucher issuance. Every voucher binds `msg.sender`, so one player's voucher cannot be redeemed by another, and the authorised id lists are hashed into the signature so they cannot be padded.
- **Relayer gas availability is an availability dependency, not just an ops detail.** The same key funds every sponsored mint. When it runs dry, sponsored claims and the retry cron both fail and player territory stops reaching the chain with no user-visible error. There is no balance alarm today. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#funding-the-relayer).
- **GPS sanity is server-side.** See [`lib/runs/validation.ts`](../lib/runs/validation.ts) for thresholds (accuracy 30m, per-capture distance 10km). Rate limits, min-interval between captures, and avg-speed caps were removed intentionally: the game accepts any mode of movement, so those checks were doing more damage to legitimate fast users than they were preventing spoofers who can simulate any transport mode anyway.
- **Fee abstraction (CIP-64)** lets players pay Celo gas in USDm, USDC, or USDT via Mento adapters.
- **Every Celo write transaction carries an ERC-8021 attribution suffix** (`miniklaim` code).

## In scope for disclosure

- On-chain contract exploits: reentrancy, integer overflow, unchecked upgrade authorization, storage collision in UUPS upgrades, EIP-712 signature replay, role escalation, ERC-1155 minting bypass, USDm vault drain (when rewards are activated), and any path through `MiniKlaimClaimRouter` that mints to an address other than the transaction sender.
- Web app: SQL injection in any `/api/*` route, GPS-spoof validation bypass, run forgery, hex-capture race conditions, cross-user data leak, session hijack.
- Backend relayer: private-key leak vector, replay of already-used claim vouchers, front-running of legitimate player claims.

## Out of scope

- Denial-of-service via naive rate limits (accepted trade-off for MVP).
- Front-end phishing (impersonation of the app or its domains).
- User wallet compromise (not our attack surface).
- Bugs in dependencies (report those upstream to OpenZeppelin, viem, wagmi, Next.js, drizzle-orm, etc.).
- Anything requiring physical access to a specific user's device.

## Disclosure

**Do not open public GitHub issues for security vulnerabilities.**

This project has no formal security program, no funded bounty, and no committed response SLA. Disclose privately through any channel you can identify (project maintainer's public handles are visible on the app's `/about` page and in the repo commit history). Response time is best-effort.

Public bug reports for non-security defects (UI issues, feature requests, i18n suggestions, etc.) are welcome via GitHub issues.
