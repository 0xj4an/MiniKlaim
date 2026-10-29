# Running MiniKlaim's scheduled work on the VPS

The three maintenance jobs used to be Railway cron services. The app and the
database now live on the VPS, Railway's services are asleep, and their
`DATABASE_URL` points at a database that is gone, so nothing was running them.

Everything they need is already inside the `miniklaim` container: the
database URL, the relayer signing key, `tsx` and `drizzle-kit` (both non-dev
dependencies), the migrations under `lib/db/migrations`, and `scripts/`.
So each job is a `docker exec` away and needs no secrets of its own.

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

## Migrations

Railway ran `npm run db:migrate` as its `preDeployCommand` (see
`railway.json`). The compose deploy on the VPS has no equivalent, so a
schema change would ship without its migration and the app would run
against an older database than it expects. Until that is wired into the
deploy, run it by hand after any deploy that adds a migration:

```sh
docker exec miniklaim npm run db:migrate
```
