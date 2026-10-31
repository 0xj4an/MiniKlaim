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

## The schedule lives in Docker, not in systemd

The first version of this used systemd user timers. They are gone: the only
way this repo's tooling reaches the VPS is a command allowlist that includes
`docker` and not `systemctl`, so a timer was something nobody here could
install, check, or fix. A schedule you cannot verify is not a schedule.

So each job is an ordinary always-on service that sleeps between runs:

```yaml
  miniklaim-finalize-orphans:
    restart: always
    command: ["sh", "-c", "while true; do npm run runs:finalize-orphans || true; sleep 3600; done"]
```

`restart: always` is what survives a reboot, the same job a timer's
`Persistent=true` did. `|| true` keeps a failed run from killing the loop —
without it one bad run would stop the schedule until someone noticed.

Both jobs run once at startup. That is fine: `finalize-orphans` is
idempotent, and `retry-unminted` only mints runs that genuinely need it.

## The jobs

| Job | Cadence | What it does |
|---|---|---|
| `runs:retry-unminted` | every 4 hours | Relayer-mints runs the player could not pay for, then settles the backlog: blocks of runs that ended over a day ago and were never recorded on-chain. **Spends from the relayer.** |
| `runs:finalize-orphans` | hourly | Closes runs with no `ended_at` started over 6 hours ago. A dropped session (app killed, phone died) otherwise blocks the player's pending-claim prompt and skews their run count. Idempotent, spends nothing. |
| `runs:settle-backlog` | manual | A catch-up for the same settlement, run by hand. Needs `-- --send` to do anything; without it, it prints the plan. |

Settlement is what makes a block survive: until a run is recorded on-chain,
its blocks exist only in the database. That is exactly what was lost on
29 Oct 2026, and what the chain let us rebuild.

## Checking on them

```sh
docker compose -f <compose> up -d miniklaim-retry-unminted miniklaim-finalize-orphans
docker logs -t --tail 50 miniklaim-finalize-orphans
docker logs -t --tail 50 miniklaim-retry-unminted
```

`-t` is what gives each line a timestamp, so the log shows the cadence.

Run either one by hand, outside its loop:

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
app itself logs.

## CPU, and why the app got slow

Memory was capped on every container; CPU was not. A local model on
`ollama` took 7 of the 8 cores (710% CPU, load average 11) and MiniKlaim's
requests went to a crawl — nothing in the app was wrong. The compose files
now carry:

```yaml
  ollama:                      # its own compose file
    cpu_shares: 256
    deploy: {resources: {limits: {cpus: "4.0", memory: 26g}}}
  miniklaim:
    cpu_shares: 2048
```

The hard `cpus` ceiling leaves four cores no model can take, and the shares
decide who wins the rest: the app outranks the model 8:1, and the cron
containers sit at 512 so a settlement never competes with a live request.

## Build arguments the VPS has to pass

`NEXT_PUBLIC_*` is inlined into the bundles at build time, so setting one in
`.env.miniklaim` changes nothing the client does. `lib/envSkew.ts` now logs
an error at server start for any of them that disagree between the build and
the runtime environment — check for that line after a deploy.

The ones with a default in the `Dockerfile` need nothing, the compose file
passes the other two, and `ops/deploy.sh` supplies the commit. The whole
deploy is one command:

```sh
ops/deploy.sh          # or: ops/deploy.sh dev
```

It fetches the ref, builds both images with `BUILD_COMMIT_SHA`, migrates,
restarts the app and both cron loops, and then greps the startup log for an
env-skew line.

`BUILD_COMMIT_SHA` is what Railway gave for free as
`RAILWAY_GIT_COMMIT_SHA`. Without it `next.config.ts` has no `deploymentId`,
so a tab left open on the old build hits "Failed to find Server Action" and
`ChunkLoadError` instead of a clean hard navigation, support emails report
`App: dev`, and Sentry tags no release on anything.

`SENTRY_AUTH_TOKEN` is the other one. It sits in `.env.miniklaim`, which
compose reads as `env_file` — runtime only, so the build never saw it and
the Sentry plugin created no release and uploaded nothing. `ops/deploy.sh`
reads it out of that file and exports it before building, and says so
loudly when it is missing. The plugin runs with `silent: true`, so a build
without the token reports success and quietly does nothing.

## Migrations

Railway ran `npm run db:migrate` as its `preDeployCommand` (see
`railway.json`). Compose has no equivalent, so a schema change could ship
without its migration and the app would run against an older database than
it expects. `ops/deploy.sh` is that hook now — it migrates between the build
and the restart, which is the order Railway gave us. By hand:

```sh
docker compose run --rm --no-deps miniklaim npm run db:migrate
```

Migration `0018` adds `hexes(owner_address, country, city)`. Applying it
takes a second or two at ~275k rows and briefly blocks writes to `hexes`,
since drizzle runs `CREATE INDEX` inside a transaction rather than
concurrently. Run it when a capture landing a moment late is acceptable.
