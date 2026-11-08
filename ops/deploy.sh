#!/usr/bin/env bash
#
# Deploy MiniKlaim on the VPS.
#
# This exists because three steps were being done by hand and one of them
# kept being forgotten. Railway ran migrations as its `preDeployCommand`;
# compose has no equivalent, so a schema change could ship without its
# migration and the app would run against an older database than it expects.
# It also passes BUILD_COMMIT_SHA, without which `next.config.ts` has no
# deploymentId and a tab left open on the old build gets a ChunkLoadError
# instead of a clean reload.
#
# Usage, from anywhere on the VPS:
#   ops/deploy.sh              # deploy origin/main
#   ops/deploy.sh dev          # deploy origin/dev
#
set -euo pipefail

REF="${1:-main}"
CLONE="/home/0xj4an/Workspaces/0xj4an/personal/code/MiniKlaim"
COMPOSE_DIR="/home/0xj4an/docker/0xj4an-personal"

# This script lives in the clone it is about to `git reset --hard`, so a
# deploy that changes the script overwrites the file bash is still reading.
# Bash reads a script incrementally, by byte offset, so it can resume in the
# middle of a line that is no longer the line it was running. Run from a copy
# instead, and the deploy that updates this file is the one that uses it.
if [ "${DEPLOY_REEXEC:-}" != "1" ]; then
  COPY="$(mktemp /tmp/miniklaim-deploy.XXXXXX.sh)"
  cat "$0" > "$COPY"
  trap 'rm -f "$COPY"' EXIT
  DEPLOY_REEXEC=1 exec bash "$COPY" "$@"
fi

cd "$CLONE"
git fetch origin
git checkout "$REF"
git reset --hard "origin/$REF"
SHA="$(git rev-parse HEAD)"
echo "==> deploying $REF at $SHA"

cd "$COMPOSE_DIR"
export BUILD_COMMIT_SHA="$SHA"

# SENTRY_AUTH_TOKEN lives in .env.miniklaim, which compose reads as env_file,
# runtime only. Build args come from the shell, so without this the Sentry
# plugin builds with no token: no release created, no artifacts uploaded, and
# `silent: true` means the build says nothing about it.
if [ -f .env.miniklaim ]; then
  SENTRY_AUTH_TOKEN="$(sed -n 's/^SENTRY_AUTH_TOKEN=//p' .env.miniklaim | tr -d '"'"'"'"' | head -1)"
  export SENTRY_AUTH_TOKEN
fi
[ -n "${SENTRY_AUTH_TOKEN:-}" ] || echo "!! SENTRY_AUTH_TOKEN missing: this build uploads nothing to Sentry"

# Refuse to build on a host that is already short.
#
# The Dockerfile now caps the build at roughly 9 GiB (NEXT_BUILD_CPUS and
# NODE_OPTIONS), but a cap only helps if the memory is there to begin with.
# This box runs about forty containers and the build is the one thing here big
# enough to push it over; when it does, the kernel does not pick the build to
# kill, it picks whatever it likes, which on 7 Nov 2026 was the running site.
# Aborting a deploy costs nothing. 12 GiB is the cap plus a margin.
MIN_AVAIL_KB=$((12 * 1024 * 1024))
AVAIL_KB="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
if [ "${AVAIL_KB:-0}" -lt "$MIN_AVAIL_KB" ]; then
  echo "!! only $((AVAIL_KB / 1024)) MiB available, need $((MIN_AVAIL_KB / 1024)) MiB to build safely"
  echo "!! not building: free memory on the host first, then run this again"
  exit 1
fi
echo "==> $((AVAIL_KB / 1024)) MiB available, building"

# The app image and the cron image are the same Dockerfile; building the
# retry service is what produces the `miniklaim-cron:latest` tag the other
# cron service uses.
docker compose build miniklaim miniklaim-retry-unminted

# Migrations run against the new image but before the new app serves traffic,
# which is the order Railway's preDeployCommand gave us.
echo "==> migrating"
docker compose run --rm --no-deps miniklaim npm run db:migrate

# Keep the log before the container that holds it is replaced.
#
# The services log to the default json-file driver, and Docker stores that log
# against the container, not the service. `up -d` creates a new container, so
# the old log is deleted with the old one and `docker logs` starts empty. That
# is four consecutive windows with nothing auditable: no way to review a fast
# travel report or check what the movement guard did, because the evidence was
# thrown away by the act of shipping the fix.
#
# Dump it first, timestamped, and keep the last 30 files per service. Logs are
# hundreds of KiB, so the whole history costs less than one image layer.
LOGDIR="$COMPOSE_DIR/logs/miniklaim"
mkdir -p "$LOGDIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
echo "==> keeping logs in $LOGDIR"
for c in miniklaim miniklaim-retry-unminted miniklaim-finalize-orphans; do
  if docker inspect "$c" >/dev/null 2>&1; then
    # || true: a container that never started has no log, and losing a log is
    # not a reason to abandon a deploy that is otherwise fine.
    docker logs "$c" >"$LOGDIR/$c-$STAMP.log" 2>&1 || true
    echo "    $c $(wc -c <"$LOGDIR/$c-$STAMP.log" | tr -d ' ') bytes"
  fi
  # shellcheck disable=SC2012
  ls -1t "$LOGDIR/$c-"*.log 2>/dev/null | tail -n +31 | while read -r old; do
    rm -f "$old"
  done
done

# --no-deps so a deploy can only touch MiniKlaim's own containers. Without
# it, `up -d` recreates any dependency whose definition has drifted from the
# running container, and on 2 Nov 2026 that was Postgres: shut down cleanly
# at 08:20:25 and serving again at 08:20:26, one second in which a claim and
# a pending-claim both got ECONNREFUSED and a player saw a 500
# (MINIKLAIM-1Q, 1P, 1N). The database is `restart: always` and is not this
# script's to recreate; changing it is a deliberate act, by hand.
echo "==> up"
docker compose up -d --no-deps miniklaim miniklaim-retry-unminted miniklaim-finalize-orphans

# A NEXT_PUBLIC_* that reached the container but not the build is silent and
# costs a day (29 Oct 2026, hex strength). lib/envSkew.ts logs it at startup;
# this is where you see it.
sleep 8
echo "==> env skew (nothing below this line is good news)"
docker logs --since 1m miniklaim 2>&1 | grep -i "env:skew" || echo "none"

echo "==> running"
docker ps --format '{{.Names}}\t{{.Status}}' | grep miniklaim
