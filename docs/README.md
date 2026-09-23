# Documentation

Start here to find the right page, and to know which page to trust when two disagree.

Organised along [Diataxis](https://diataxis.fr) lines: a page that explains is not the same as a page you look things up in, and mixing them is how docs rot. Each fact below has exactly one owner. If you find the same fact in two places, the owner wins and the copy is a bug.

## Public documentation (tracked in git)

| Document | Kind | Read it when |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Explanation | You want the mental model: layers, run settlement, identity, multichain, anti-abuse, MiniPay constraints. |
| [CONTRACTS.md](CONTRACTS.md) | Reference | You need an address, a role, a deploy block, the upgrade model, fee-currency adapters, or the provenance of anything on-chain. |
| [API.md](API.md) | Reference | You need an endpoint's shape, status codes, or request body. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | How-to | You are shipping: Railway services, env vars, cron jobs, contract deploys, relayer funding, rollback. |
| [LOCAL-DEV.md](LOCAL-DEV.md) | How-to | You are setting up a dev machine: Postgres, H3, env, ngrok for MiniPay. |
| [../contracts/README.md](../contracts/README.md) | How-to | You are working inside the Foundry workspace: install, build, test, lint. |
| [../SECURITY.md](../SECURITY.md) | Explanation | You are assessing trust: audit status, key concentration, threat model, disclosure. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | How-to | You are opening an issue or a pull request. |
| [../CHANGELOG.md](../CHANGELOG.md) | Reference | You want to know what changed and when. |

## Who owns which fact

Duplicating any of these is how the docs drifted before: the Foundry suite was documented as 57 tests when it was 74, and the retry cron as every 20 minutes when it runs every 4 hours.

| Fact | Owner | Everywhere else should |
|---|---|---|
| Contract addresses, implementations, legacy contracts | [CONTRACTS.md](CONTRACTS.md) | link, not repeat |
| Copyable contract addresses for config | `.env.example` | - |
| Roles, upgrade model, provenance, role history | [CONTRACTS.md](CONTRACTS.md) | link |
| Test-suite breakdown | [CONTRACTS.md](CONTRACTS.md) | run `forge test` |
| Production env vars, Railway services, cron schedules | [DEPLOYMENT.md](DEPLOYMENT.md) | link |
| Endpoint contracts | [API.md](API.md) | link |
| Threat model and key concentration | [../SECURITY.md](../SECURITY.md) | link |
| Badge catalog | `lib/onchain/badgeCatalog.ts` | link |
| Token and fee-adapter addresses | `lib/tokens.ts`, mirrored in [CONTRACTS.md](CONTRACTS.md) | link |

Live state beats every document here. Chain data comes from an RPC or an explorer, Railway config from Railway. When a doc contradicts the live source, the doc is wrong.

## Working notes (local only, not in git)

Excluded via `.git/info/exclude`, so they never reach the repo. They are working material, not published documentation, and they are allowed to be messy.

- [tasks/](tasks/) - roadmap, listing status, backlog, specs. See [tasks/README.md](tasks/README.md).
- `superpowers/specs/` - the original 2026-05-17 design spec. Historical; superseded by ARCHITECTURE.md and CONTRACTS.md.
- `../JOURNAL.md` - per-change log of decisions, gotchas and build evidence.
