# Running MiniKlaim's scheduled work on the VPS

The three maintenance jobs used to be Railway cron services. The app and the
database now live on the VPS, Railway's services are asleep, and their
`DATABASE_URL` points at a database that is gone, so nothing was running them.

Everything they need is now inside the `miniklaim` container: the database
URL, the relayer signing key, `tsx` and `drizzle-kit` (both non-dev
dependencies), the migrations under `lib/db/migrations`, `scripts/`, and
`tsconfig.json` — `tsx` resolves the `@/...` imports through tsconfig paths,
and the files under `lib/` import each other that way, so without it
`settle-backlog` dies in `resolveTsPathsSync`. Each job needs no secrets of
its own.

Either invocation works, both verified on the VPS:

```sh
docker exec miniklaim npm run runs:finalize-orphans
docker compose -f <compose> --profile cron run --rm miniklaim-finalize-orphans
```

The compose services give each job its own memory limit, which is worth
having for the settlement, so the timers use those.

## The jobs

| Job | Cadence | What it does |
|---|---|---|
| `runs:retry-unminted` | every 4 hours | Relayer-mints runs the player could not pay for, then settles the backlog: blocks of runs that ended over a day ago and were never recorded on-chain. **Spends from the relayer.** |
| `runs:finalize-orphans` | hourly | Closes runs with no `ended_at` started over 6 hours ago. A dropped session (app killed, phone died) otherwise blocks the player's pending-claim prompt and skews their run count. Idempotent, spends nothing. |
| `runs:settle-backlog` | manual | A catch-up for the same settlement, run by hand. Needs `-- --send` to do anything; without it, it prints the plan. |

Settlement is what makes a block survive: until a run is recorded on-chain,
its blocks exist only in the database. That is exactly what was lost on
29 Oct 2026, and what the chain let us rebuild.

## Installing the timers

```sh
cp ops/systemd/miniklaim-*.service ops/systemd/miniklaim-*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now miniklaim-retry-unminted.timer
systemctl --user enable --now miniklaim-finalize-orphans.timer
systemctl --user list-timers 'miniklaim-*'
```

Check a run with `journalctl --user -u miniklaim-retry-unminted -n 50`.

Dry-run either job first, without a timer:

```sh
docker exec miniklaim npm run runs:finalize-orphans
docker exec miniklaim npm run runs:settle-backlog          # plan only
docker exec miniklaim npm run runs:settle-backlog -- --send
```

## Why the jobs set LOG_LEVEL

The scripts report only through `log.info`, and `lib/logger.ts` silences
anything below `warn` when `NODE_ENV=production` — which is how the image
runs. So a job would do its work and print nothing, and a job you cannot
verify from its logs is a job you cannot trust.

`LOG_LEVEL=info` on the cron services fixes that without touching how the
app itself logs. Add it beside the other variables:

```yaml
  miniklaim-retry-unminted:
    env_file: .env.miniklaim
    environment:
      LOG_LEVEL: info
```

Then `journalctl --user -u miniklaim-retry-unminted -n 50` shows what it
settled, instead of nothing.

## Build arguments the VPS has to pass

`NEXT_PUBLIC_*` is inlined into the bundles at build time, so setting one in
`.env.miniklaim` changes nothing the client does. `lib/envSkew.ts` now logs
an error at server start for any of them that disagree between the build and
the runtime environment — check for that line after a deploy.

The ones with a default in the `Dockerfile` need nothing. These two do:

```yaml
  miniklaim:
    build:
      args:
        NEXT_PUBLIC_CELO_ATTRIBUTION_CODE: ${NEXT_PUBLIC_CELO_ATTRIBUTION_CODE}
        BUILD_COMMIT_SHA: ${BUILD_COMMIT_SHA}
```

`BUILD_COMMIT_SHA` is what Railway gave for free as
`RAILWAY_GIT_COMMIT_SHA`. Without it `next.config.ts` has no `deploymentId`,
so a tab left open on the old build hits "Failed to find Server Action" and
`ChunkLoadError` instead of a clean hard navigation, and support emails
report `App: dev`. Pass it per build:

```sh
docker compose build --build-arg BUILD_COMMIT_SHA=$(git -C <clone> rev-parse HEAD) miniklaim
```

## Migrations

Railway ran `npm run db:migrate` as its `preDeployCommand` (see
`railway.json`). The compose deploy on the VPS has no equivalent, so a
schema change would ship without its migration and the app would run
against an older database than it expects. Until that is wired into the
deploy, run it by hand after any deploy that adds a migration:

```sh
docker exec miniklaim npm run db:migrate
```

Migration `0018` adds `hexes(owner_address, country, city)`. Applying it
takes a second or two at ~275k rows and briefly blocks writes to `hexes`,
since drizzle runs `CREATE INDEX` inside a transaction rather than
concurrently. Run it when a capture landing a moment late is acceptable.
