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

1. Fork the repo and create a feature branch off `dev` (never off `main`):
   ```bash
   git checkout dev && git pull
   git checkout -b feat/short-description
   ```

2. Make your changes. Keep commits focused (one concern per commit) and use [Conventional Commits](https://www.conventionalcommits.org/) syntax:
   ```
   <type>(<scope>): <subject>
   ```
   Types used in this repo: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `ci`, `build`.

3. Before opening the PR, verify:

   ```bash
   npm run lint         # ESLint clean (0 warnings preferred)
   npm run build        # Next.js typecheck + build passes
   cd contracts && forge test   # If you touched Solidity: 100% pass
   ```

4. Open the PR against `dev`. Fill in the [PR template](.github/pull_request_template.md). The `main` branch is release-only and merged from `dev` in batches.

## Style + conventions

- **English** for all code, comments, commit messages, and documentation.
- **No emojis** in code, docs, or commit messages unless the feature explicitly requires them (e.g. UI where the user asked for one).
- **No em-dashes** (`--`) in any text output. Use commas, parentheses, or plain hyphens with spaces.
- **Comments explain WHY, not WHAT.** Well-named identifiers document behavior; comments carry non-obvious constraints.
- **No `console.log` / `console.warn` / `console.error` in feature code.** Use `createLogger(namespace)` from [`lib/logger.ts`](lib/logger.ts).
- **UI strings live in i18n.** Never hardcode user-facing English or Spanish inside components.
- **MiniPay UX constraints apply.** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "MiniPay constraints" for the full list (no `personal_sign`, no `signTypedData`, no CELO display, specific vocabulary rules).
- **File size soft cap**: aim for < 800 LOC per file. Split when approaching.
- **PR size soft cap**: 1k-3k LOC changed. Split when significantly larger.

## Testing

The Solidity contracts have a Foundry test suite (`contracts/test/*.t.sol`); run with `cd contracts && forge test`. All PRs that touch contracts must keep the suite passing.

The Next.js app has no unit-test suite today (only build-time typecheck). Manual smoke tests recommended for any UI or API change, especially in MiniPay + Farcaster + Startale hosts.

## Licensing

By submitting a pull request, you agree that your contribution is licensed under the same MIT license as the rest of the project (see [LICENSE](LICENSE)).
