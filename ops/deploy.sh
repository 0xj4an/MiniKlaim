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

cd "$CLONE"
git fetch origin
git checkout "$REF"
git reset --hard "origin/$REF"
SHA="$(git rev-parse HEAD)"
echo "==> deploying $REF at $SHA"

cd "$COMPOSE_DIR"
export BUILD_COMMIT_SHA="$SHA"

# The app image and the cron image are the same Dockerfile; building the
# retry service is what produces the `miniklaim-cron:latest` tag the other
# cron service uses.
docker compose build miniklaim miniklaim-retry-unminted

# Migrations run against the new image but before the new app serves traffic,
# which is the order Railway's preDeployCommand gave us.
echo "==> migrating"
docker compose run --rm --no-deps miniklaim npm run db:migrate

echo "==> up"
docker compose up -d miniklaim miniklaim-retry-unminted miniklaim-finalize-orphans

# A NEXT_PUBLIC_* that reached the container but not the build is silent and
# costs a day (29 Oct 2026, hex strength). lib/envSkew.ts logs it at startup;
# this is where you see it.
sleep 8
echo "==> env skew (nothing below this line is good news)"
docker logs --since 1m miniklaim 2>&1 | grep -i "env:skew" || echo "none"

echo "==> running"
docker ps --format '{{.Names}}\t{{.Status}}' | grep miniklaim
