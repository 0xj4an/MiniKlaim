# Running MiniKlaim's scheduled work on the VPS

The three maintenance jobs used to be Railway cron services. The app and the
database now live on the VPS, Railway's services are asleep, and their
`DATABASE_URL` points at a database that is gone, so nothing was running them.

Everything they need is now inside the `miniklaim` container: the database
URL, the relayer signing key, `tsx` and `drizzle-kit` (both non-dev
dependencies), the migrations under `lib/db/migrations`, `scripts/`, and
`tsconfig.json`: `tsx` resolves the `@/...` imports through tsconfig paths,
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
`Persistent=true` did. `|| true` keeps a failed run from killing the loop:
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
anything below `warn` when `NODE_ENV=production`: which is how the image
runs. So a job would do its work and print nothing, and a job you cannot
verify from its logs is a job you cannot trust.

`LOG_LEVEL=info` on the cron services fixes that without touching how the
app itself logs.

## CPU, and why the app got slow

Memory was capped on every container; CPU was not. A local model on
`ollama` took 7 of the 8 cores (710% CPU, load average 11) and MiniKlaim's
requests went to a crawl: nothing in the app was wrong. The compose files
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

## A deploy no longer 502s whoever is mid-request

Recreating the container leaves Caddy with no upstream for the seconds it
takes to come back, and anyone mid-request got a 502. The access log showed
them in bursts at the exact minute of each deploy: 11 on 30 Oct, 16 on
31 Oct: not scattered.

Retrying the dial (31 Oct) narrowed the window but could not close it: there
was nowhere else to retry to. The 07:13 deploy on 8 Nov still cost 25 events
across 18 players (MINIKLAIM-1C, -1F).

So there are two app containers now, `miniklaim` and `miniklaim-standby`,
running the same image, and the proxy has both. This lives in the shared
Caddyfile on the VPS (`/home/0xj4an/docker/infra/caddy/Caddyfile`, not in
this repo), in the MiniKlaim block only:

```
miniklaim.fun, www.miniklaim.fun {
    reverse_proxy miniklaim:3000 miniklaim-standby:3000 {
        lb_policy first
        lb_try_duration 20s
        lb_try_interval 250ms
        fail_duration 15s
        transport http {
            dial_timeout 1s
        }
    }
}
```

`dial_timeout` is the one that makes the retry budget mean anything, and it
was found by measuring rather than reasoning. With two upstreams but no dial
timeout, two requests out of 153 sat for the client's full 10 s instead of
failing over after 250 ms: `lb_try_duration` governs the gap *between*
attempts, and a single dial to a container that is being replaced can hang
far longer than the whole budget, so the retry loop never got to run. A
healthy dial across the `shared` bridge takes microseconds, so 1 s is three
orders of magnitude of headroom, and a spurious failover costs nothing
because the standby serves the same image.

`lb_policy first` means this is a standby and not a load balancer:
everything goes to `miniklaim` while it is up, and to the standby only when
a dial to the primary fails, so one container keeps its caches warm and
behaviour stays predictable. `fail_duration` benches an upstream that
refused a connection, so during a recreation requests go straight to the
other one instead of each paying a failed dial first.

**There are deliberately no active health checks.** `health_uri /api/health`
is the obvious thing to add and it would be a mistake: that route answers
**503 when the database is slow or unreachable**, so a Postgres blip would
mark *both* upstreams unhealthy and Caddy would 502 everything, including the
pages that never touch the database. Passive checking keys off whether a TCP
connection can be opened, which is exactly what is false while a container is
being replaced and is blind to database state. `ops/deploy.sh` gates its
rolling restart on the same signal for the same reason.

Only a *failed connection* is retried, so nothing was sent and replaying is
safe even for a POST. App-level 500s do not bench an upstream either, because
`unhealthy_status` is not set.

Measured by requesting the home page four times a second through a full
`--force-recreate` of the primary: **161 of 161 requests returned 200**, and
before the standby existed the same event cost real players hard 502s (25
events across 18 people on the 07:13 deploy of 8 Nov). `fail_duration` is
visible in the shape of it: exactly one request pays the cost of discovering
the primary is gone, and everything after it is routed straight to the
standby.

What is left is that one request, which took 8.8 s, and it is **not** a dial
problem: lowering `dial_timeout` from 2 s to 1 s barely moved it. It is a
request that was already in flight when the container took SIGTERM. A
response that has begun cannot be transparently replayed, so it waits out
Docker's stop grace period. Closing that needs the app to drain in-flight
requests on SIGTERM before exiting, which is a change in the app and not in
the proxy. Until then a deploy costs one slow success, not a failure.

`ops/deploy.sh` replaces the two containers one at a time, standby first so
that traffic only ever lands on a container already running the new build,
and waits for each to answer before touching the next.

Two containers against one database is only safe because nothing that matters
lives in the server's memory: the per-run token is a sha256 in
`runs.claim_token_hash` and the sponsor cap is counted from the
`sponsored_mints` table, so either container can answer for work the other
started. The only in-process state is read-only caching (the cities table, the
basemap style), which costs a second copy and nothing else, and nothing in the
web server runs on a timer: the maintenance jobs are their own containers and
are still single. Keep it that way. Anything that needs to happen once per
deploy, or once per interval, does not belong in the app.

Validate with `caddy validate` and reload with `caddy reload` before trusting
any edit to that file: it fronts every site on the box.

## Build arguments the VPS has to pass

`NEXT_PUBLIC_*` is inlined into the bundles at build time, so setting one in
`.env.miniklaim` changes nothing the client does. `lib/envSkew.ts` now logs
an error at server start for any of them that disagree between the build and
the runtime environment: check for that line after a deploy.

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
compose reads as `env_file`: runtime only, so the build never saw it and
the Sentry plugin created no release and uploaded nothing. `ops/deploy.sh`
reads it out of that file and exports it before building, and says so
loudly when it is missing. The plugin runs with `silent: true`, so a build
without the token reports success and quietly does nothing.

## Migrations

Railway ran `npm run db:migrate` as its `preDeployCommand` (see
`railway.json`). Compose has no equivalent, so a schema change could ship
without its migration and the app would run against an older database than
it expects. `ops/deploy.sh` is that hook now: it migrates between the build
and the restart, which is the order Railway gave us. By hand:

```sh
docker compose run --rm --no-deps miniklaim npm run db:migrate
```

Migration `0018` adds `hexes(owner_address, country, city)`. Applying it
takes a second or two at ~275k rows and briefly blocks writes to `hexes`,
since drizzle runs `CREATE INDEX` inside a transaction rather than
concurrently. Run it when a capture landing a moment late is acceptable.
