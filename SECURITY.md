# Security

**MiniKlaim is unaudited software. Use at your own risk.**

## Audit status

The smart contracts (`MiniKlaimHexes`, `MiniKlaimBadges`, and the deferred `MiniKlaimRewards`) have not undergone formal audit. No security firm has reviewed the code. Bugs, exploits, and funds loss are possible.

The contracts are deployed under the MIT license. There is no warranty (see [LICENSE](LICENSE)). Interact only with values you are willing to lose.

## Architecture facts security reviewers should know

- **Contracts are UUPS-upgradeable.** The `DEFAULT_ADMIN_ROLE` holder can upgrade to arbitrary logic. Currently a single externally-owned account (see [docs/CONTRACTS.md](docs/CONTRACTS.md) for the address). No multisig, no timelock, no governance module.
- **The same account also holds operational roles** on every contract:
  - `CAPTURER_ROLE` on `MiniKlaimHexes` (can mint or transfer any hex).
  - `MINTER_ROLE` on `MiniKlaimBadges` (can mint any badge to any address).
  - (Future) `REWARDER_ROLE` on `MiniKlaimRewards` (can sign reward vouchers).
- **The same private key runs the backend relayer** and lives in the Railway environment. Compromise of that key allows arbitrary mint, upgrade, and (when rewards are activated) drain of the USDm pool.
- **Player-submitted transactions are gated by EIP-712 vouchers** signed by the backend. Nonces prevent replay; role membership gates voucher issuance.
- **GPS validation is server-authoritative.** See [`lib/runs/validation.ts`](../lib/runs/validation.ts) for thresholds (accuracy 30m, rate limit 15 hex/min, min 2s between, run avg speed <8 m/s).
- **Fee abstraction (CIP-64)** lets players pay Celo gas in USDm, USDC, or USDT via Mento adapters.
- **Every Celo write transaction carries an ERC-8021 attribution suffix** (`miniklaim` code).

## In scope for disclosure

- On-chain contract exploits: reentrancy, integer overflow, unchecked upgrade authorization, storage collision in UUPS upgrades, EIP-712 signature replay, role escalation, ERC-1155 minting bypass, USDm vault drain (when rewards are activated).
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
