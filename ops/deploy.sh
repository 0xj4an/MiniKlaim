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
# Dump it first, timestamped, and keep the last 120 files per service. Logs
# are tens of KiB, so the whole history costs less than one image layer.
#
# `-t` puts Docker's own time on every line: the app's lines carry none, so a
# kept log could say what happened and not when. 120 and not 30 because 23
# deploys in 48 h (23-24 Nov 2026) left 30 files covering under three days.
LOGDIR="$COMPOSE_DIR/logs/miniklaim"
mkdir -p "$LOGDIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
echo "==> keeping logs in $LOGDIR"
for c in miniklaim miniklaim-standby miniklaim-retry-unminted miniklaim-finalize-orphans; do
  if docker inspect "$c" >/dev/null 2>&1; then
    # || true: a container that never started has no log, and losing a log is
    # not a reason to abandon a deploy that is otherwise fine.
    docker logs -t "$c" >"$LOGDIR/$c-$STAMP.log" 2>&1 || true
    echo "    $c $(wc -c <"$LOGDIR/$c-$STAMP.log" | tr -d ' ') bytes"
  fi
  # shellcheck disable=SC2012
  # The digit after the dash matters: "miniklaim-*" also matched the three
  # other services' files, so the limit was shared and each kept a quarter.
  ls -1t "$LOGDIR/$c-"[0-9]*.log 2>/dev/null | tail -n +121 | while read -r old; do
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
#
# Wait until a container answers on its own port, so the next one is only
# replaced once this one can take the traffic.
#
# The containers only `expose` 3000, so there is no published port to curl.
# They are reachable from the host by their address on the `shared` bridge,
# which is how Caddy reaches them too.
#
# Deliberately NOT a check that the app is healthy: `/api/health` answers 503
# when the database is slow or unreachable, and gating a deploy on the
# database means a Postgres blip leaves one container new and the other old.
# What this has to prove is that the process is listening and serving, so 200
# and 503 both pass and only a refused connection (000) or a proxy error
# fails. It is the same thing Caddy keys off below.
wait_serving() {
  local name="$1" ip code deadline
  deadline=$(( $(date +%s) + 90 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    ip="$(docker inspect -f '{{.NetworkSettings.Networks.shared.IPAddress}}' "$name" 2>/dev/null || true)"
    if [ -n "$ip" ]; then
      code="$(curl -sS -m 3 -o /dev/null -w '%{http_code}' "http://$ip:3000/api/health" 2>/dev/null || echo 000)"
      case "$code" in
        200|503)
          echo "    $name serving (http $code)"
          return 0
          ;;
      esac
    fi
    sleep 2
  done
  echo "!! $name did not answer in 90s"
  return 1
}

#
# Pay the cold start ourselves instead of charging it to a player.
#
# Measured 8 Nov 2026: a container that has just started accepting connections
# answers its first page request in 5.7 s, and that one request is the whole
# remaining cost of a deploy. It was first blamed on the app not draining on
# SIGTERM, and that was wrong: `docker stop` takes 1.4 s and exits 143, so the
# signal is honoured and Next finishes what it is holding. The slow request is
# at the other end, on the way up.
#
# So ask for a real page here, once, before the container is carrying anyone.
# Best effort on purpose: the deploy must not fail because a warm-up request
# was slow or the page needs a database that is having a moment. If it does not
# work, the only cost is that a player pays the 5.7 s instead of us.
#
# This works because Caddy benches an upstream that refused a connection for
# `fail_duration`, so the primary is out of rotation for a window after it is
# replaced, and this runs inside that window. See ops/README.md.
warm() {
  local name="$1" ip
  ip="$(docker inspect -f '{{.NetworkSettings.Networks.shared.IPAddress}}' "$name" 2>/dev/null || true)"
  [ -n "$ip" ] || return 0
  local t0 t1
  t0="$(date +%s%3N)"
  curl -sS -m 30 -o /dev/null "http://$ip:3000/" 2>/dev/null || true
  t1="$(date +%s%3N)"
  echo "    $name warmed in $((t1 - t0)) ms"
}

# Replace the two app containers one at a time, not both at once.
#
# Until today a deploy stopped the only app container and started a new one,
# and for those seconds Caddy had nothing to proxy to: whoever was mid-request
# got a 502. Caddy retrying the dial (lb_try_duration, 31 Oct) narrowed the
# window but could not remove it, because there was nowhere else to retry to.
# The 07:13 deploy on 8 Nov 2026 cost 25 events across 18 players, filed as
# MINIKLAIM-1C and -1F.
#
# So there are two of them now, `miniklaim` and `miniklaim-standby`, running
# the same image, and Caddy has both as upstreams with `lb_policy first`:
# everything goes to `miniklaim` while it is up, and to the standby only when
# a dial to the primary fails. Standby goes first so that by the time traffic
# lands on it, it is already running the new build; then the primary is
# replaced while the standby carries the requests.
#
# Both containers serve the same database and the same relayer, which is only
# safe because nothing that matters is held in the server's memory: the
# per-run token is a sha256 in `runs.claim_token_hash` and the sponsor cap is
# counted from the `sponsored_mints` table, so either container can answer for
# work the other started. The only in-process state is read-only caching (the
# cities table, the basemap style), which costs a second copy and nothing else.
# Nothing in the web server runs on a timer; the maintenance jobs are their own
# containers and are still single.
# Take a running container out of rotation before replacing it.
#
# Next drains on SIGTERM, but the request already on its way when the socket
# closes is lost: about one 502 per deploy (24-26 Nov 2026). The flag makes
# /api/ready answer 503; with Caddy's active health check on that path
# (health_interval 2s) no new request is routed here after a few seconds, and
# the ones in flight finish before `docker compose up` sends SIGTERM. Without
# that Caddy setting this only costs DRAIN_WAIT seconds per container. The new
# container starts without the flag, so it is ready as soon as it answers.
DRAIN_WAIT="${DRAIN_WAIT:-5}"
drain() {
  local name="$1"
  if docker exec "$name" sh -c 'touch /tmp/miniklaim-draining' 2>/dev/null; then
    echo "    $name draining for ${DRAIN_WAIT}s"
    sleep "$DRAIN_WAIT"
  fi
}

wait_ready() {
  local name="$1" ip i
  ip="$(docker inspect -f '{{.NetworkSettings.Networks.shared.IPAddress}}' "$name" 2>/dev/null || true)"
  [ -n "$ip" ] || return 0
  for i in $(seq 1 60); do
    if [ "$(curl -s -o /dev/null -m 3 -w '%{http_code}' "http://$ip:3000/api/ready" || true)" = "200" ]; then
      echo "    $name ready after ~$((i * 2))s"
      return 0
    fi
    sleep 2
  done
  echo "    $name not ready after 120s, carrying on (it lets itself in at 90s)"
}

echo "==> up (rolling: standby, then primary)"
drain miniklaim-standby
docker compose up -d --no-deps miniklaim-standby
wait_serving miniklaim-standby
warm miniklaim-standby
# The primary is about to be drained, so everything will go to the standby.
# Wait until the standby says it is ready (world list built, see
# app/api/ready), or Caddy would have no ready upstream for those seconds.
wait_ready miniklaim-standby
drain miniklaim
docker compose up -d --no-deps miniklaim
wait_serving miniklaim
warm miniklaim
docker compose up -d --no-deps miniklaim-retry-unminted miniklaim-finalize-orphans

# A NEXT_PUBLIC_* that reached the container but not the build is silent and
# costs a day (29 Oct 2026, hex strength). lib/envSkew.ts logs it at startup;
# this is where you see it.
echo "==> env skew (nothing below this line is good news)"
docker logs --since 2m miniklaim 2>&1 | grep -i "env:skew" || echo "none"
docker logs --since 2m miniklaim-standby 2>&1 | grep -i "env:skew" || echo "none"

# A 200 is not a working answer. On 17 Nov 2026 Next 16.4 started compressing
# what /api/hexes had already compressed, every response went out as gzip
# inside gzip with a 200, and the maps were blank for 5.5 h: the health check
# and every alert look at the status code, not the body. So open one body the
# way a browser does (one layer of decoding) and check it is JSON. Asks each
# container directly, so it says which one, and never fails the deploy: the
# containers are already serving, and this is where you find out.
# A feature that ships before its key answers 503 and says nothing (place
# search, 24 Nov 2026). /api/health lists the settings that are missing.
echo "==> missing settings (nothing below this line is good news)"
missing_env() {
  local name="$1" ip out
  ip="$(docker inspect -f '{{.NetworkSettings.Networks.shared.IPAddress}}' "$name" 2>/dev/null || true)"
  [ -n "$ip" ] || return 0
  out="$(curl -sS -m 5 "http://$ip:3000/api/health" 2>/dev/null | grep -o '"env":{"missing":\[[^]]*\]' || true)"
  case "$out" in
    ''|*'"missing":[]') ;;
    *) echo "    !!! $name: $out" ;;
  esac
}
missing_env miniklaim-standby
missing_env miniklaim
[ -n "$(missing_env miniklaim)$(missing_env miniklaim-standby)" ] || echo "none"

echo "==> body check (a browser must be able to read the map data)"
body_check() {
  local name="$1" ip first
  ip="$(docker inspect -f '{{.NetworkSettings.Networks.shared.IPAddress}}' "$name" 2>/dev/null || true)"
  [ -n "$ip" ] || { echo "    $name: no ip, not checked"; return 0; }
  # `head -c 1` closes the pipe after one byte, so curl ends with a write
  # error whenever the body is still arriving. Under `set -o pipefail` that
  # killed the script right here, after a deploy that had already worked
  # (24 Nov 2026, logged as DEPLOY_FAILED_OR_BUSY). The first byte is all
  # this needs; curl's exit status says nothing about it.
  first="$({ curl -sS -m 30 --compressed "http://$ip:3000/api/hexes?res=2" 2>/dev/null || true; } | head -c 1 | od -An -c | tr -d ' ' || true)"
  if [ "$first" = "{" ]; then
    echo "    $name: ok"
  else
    echo "    $name: BROKEN, /api/hexes?res=2 does not open as JSON (first byte: '${first:-none}')"
    echo "    !!! the maps will be blank. Two layers of gzip looks like first byte 037."
  fi
}
body_check miniklaim-standby
body_check miniklaim

echo "==> running"
docker ps --format '{{.Names}}\t{{.Status}}' | grep miniklaim
