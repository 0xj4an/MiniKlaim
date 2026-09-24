# Contributing to MiniKlaim

Thanks for considering a contribution. This is a solo-maintained project; contributions are welcome but response times are best-effort.

## Ways to help

- **Bug reports**: use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include steps to reproduce, expected vs actual behavior, host wallet (MiniPay / Farcaster / Startale / browser + wallet name), and chain (Celo mainnet or Soneium).
- **Feature ideas**: use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Please read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first so proposals align with the existing shape of the app.
- **Pull requests**: see below.
- **Translations**: strings live in [`lib/i18nDict.ts`](lib/i18nDict.ts). Only English and Spanish exist today. Please open an issue first before starting a large translation so we can coordinate keys.
- **Security issues**: do NOT open a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

See [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md) for the full local setup guide (Postgres + PostGIS + H3, Foundry, npm, env vars).

Quick version:

```bash
npm install
cd contracts && ./install-deps.sh && cd ..
cp .env.example .env.local  # fill in DATABASE_URL and contract addresses
npm run db:push
npm run db:seed:world
npm run dev
```

## Pull-request flow

1. Fork the repo and create a feature branch off `main`:

   ```bash
   git checkout main && git pull
   git checkout -b feat/short-description
   ```

2. Make your changes. Keep commits focused (one concern per commit) and use [Conventional Commits](https://www.conventionalcommits.org/) syntax:

   ```
   <type>(<scope>): <subject>
   ```

   Types used in this repo: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `ci`, `build`.

3. Before opening the PR, run exactly what CI runs. Anything less and you can
   pass locally but fail the check:

   ```bash
   npx eslint .                 # lint
   npx tsc --noEmit             # typecheck
   npm test                     # vitest unit suite
   npm run build                # Next.js production build
   cd contracts && forge test   # only if you touched Solidity
   ```

   CI is [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and runs these
   on every pull request. If you change the commands there, change them here.

4. Open the PR against `main` and fill in the [PR template](.github/pull_request_template.md). Merging a PR deploys: Railway builds `main` on every push and the app is live a few minutes later, so a merge is a release.

## Style + conventions

- **English** for all code, comments, commit messages, and documentation.
- **No emojis** in code, docs, or commit messages unless the feature explicitly requires them (e.g. UI where the user asked for one).
- **Plain ASCII punctuation only** in any text output: no em-dashes, en-dashes, curly quotes or unicode ellipses. Use commas, parentheses, or a plain hyphen with spaces around it.
- **Comments explain WHY, not WHAT.** Well-named identifiers document behavior; comments carry non-obvious constraints.
- **No `console.log` / `console.warn` / `console.error` in feature code.** Use `createLogger(namespace)` from [`lib/logger.ts`](lib/logger.ts).
- **UI strings live in i18n.** Never hardcode user-facing English or Spanish inside components.
- **MiniPay UX constraints apply.** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "MiniPay constraints" for the full list (no `personal_sign`, no `signTypedData`, no CELO display, specific vocabulary rules).
- **File size soft cap**: aim for < 800 LOC per file. Split when approaching.
- **PR size soft cap**: 1k-3k LOC changed. Split when significantly larger.

## Testing

The Solidity contracts have a Foundry test suite (`contracts/test/*.t.sol`); run with `cd contracts && forge test`. All PRs that touch contracts must keep the suite passing.

The Next.js app has a Vitest suite (`*.test.ts`); run with `npm test`. Pure logic (H3 interpolation, voucher nonces, the in-flight claim registry, the relayer queue) is covered there. Run it before opening a PR.

Coverage stops at anything needing a browser or a wallet, so manual smoke tests are still expected for UI and API changes, especially across MiniPay, Farcaster and Startale hosts.

## Licensing

By submitting a pull request, you agree that your contribution is licensed under the same MIT license as the rest of the project (see [LICENSE](LICENSE)).
