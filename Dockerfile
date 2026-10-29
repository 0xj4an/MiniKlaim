FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json .npmrc ./
RUN npm ci

COPY . .

# Build-time env vars (NEXT_PUBLIC_* baked into the JS bundle).
# DATABASE_URL must be set so lib/db/index.ts does not throw at import time
# during page data collection. The real value comes from .env at runtime.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ARG NEXT_PUBLIC_SITE_URL=https://www.miniklaim.fun
ARG NEXT_PUBLIC_CELO_HEXES_ADDRESS=0x9945dDEAa9C52c3C4e667B71B698c4e4551F242B
ARG NEXT_PUBLIC_CELO_BADGES_ADDRESS=0x79c5d6365f447d1F707EA6d4bDE5D6A96f181cf7
ARG NEXT_PUBLIC_SONEIUM_HEXES_ADDRESS=0x4FE122eC088501Be53c5a12E1f0F313eD71AeB4C
ARG NEXT_PUBLIC_SONEIUM_BADGES_ADDRESS=0xa9ab7390f79B937C9c0a1FDFA1A40C2E145eAbd8
ARG NEXT_PUBLIC_CELO_CLAIM_ROUTER_ADDRESS=0x9C3369e1519B03c16C329aCE13dB528eC8Ca8c74
ARG NEXT_PUBLIC_LINK_VERIFIER_ADDRESS=0x8da26Ae1B32a7e4Cd158622D7d70Fe16D6F1dE83
ARG NEXT_PUBLIC_POSTHOG_KEY=phc_BfGaTTfndhRm2goNFmbvVSJRBju7onARjVxjYhrLJpZe
ARG NEXT_PUBLIC_SENTRY_DSN=https://632fb1ef18a8c06c5173be4ee4fa3b4e@o4512063261179904.ingest.us.sentry.io/4512177112416256

# Celo mainnet has run the v2 Hexes proxy since 2026-10-20, so this is 1 and
# not blank. An ARG with no default is empty at build time unless the build
# passes it, and `hexesRecords === "1"` decides a lot: with it off the profile
# hides "mint your blocks", `settleBacklog` returns `not-v2` and the
# settlement cron does nothing, and captures fall back to the v1 path that
# mints an ERC-721 per block instead of recording them. The move to the VPS
# dropped it and all three went quiet (29 Oct 2026).
ARG NEXT_PUBLIC_CELO_HEXES_RECORDS=1

# Hex strength (lib/runs/hexStrength.ts) reads "on". Declared so a build can
# turn it on; blank leaves it off, which is the current intent.
ARG NEXT_PUBLIC_HEX_STRENGTH

# Must be passed with --build-arg (or compose `build.args`) from the
# environment: the attribution tag is the one Celo asks stay private, so it
# gets no default here. Blank means every write tx goes out untagged and the
# activity is not credited to MiniKlaim.
ARG NEXT_PUBLIC_CELO_ATTRIBUTION_CODE

# Unset on Celo mainnet today: only the /api/health report reads it.
ARG NEXT_PUBLIC_CELO_REWARDS_ADDRESS

# Testnet and Soneium; blank is correct until those are deployed.
ARG NEXT_PUBLIC_CELO_SEPOLIA_HEXES_ADDRESS
ARG NEXT_PUBLIC_CELO_SEPOLIA_BADGES_ADDRESS
ARG NEXT_PUBLIC_CELO_SEPOLIA_CLAIM_ROUTER_ADDRESS
ARG NEXT_PUBLIC_CELO_SEPOLIA_REWARDS_ADDRESS
ARG NEXT_PUBLIC_CELO_SEPOLIA_HEXES_RECORDS
ARG NEXT_PUBLIC_SONEIUM_CLAIM_ROUTER_ADDRESS
ARG NEXT_PUBLIC_SONEIUM_HEXES_RECORDS

# Source maps upload; blank just skips it.
ARG SENTRY_AUTH_TOKEN

# prebuild extracts the cities JSON, then next build
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# The cities index is ~135k entries and costs ~55 MB of heap the first time
# a capture resolves a city, on top of the Next.js baseline. Node sizes its
# old space from the container limit, so a 512 MB container left it ~256 MB
# and the process died in a restart loop (29 Oct 2026). Ask for the heap
# explicitly instead of inheriting whatever the limit implies.
ENV NODE_OPTIONS=--max-old-space-size=1536

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
# The maintenance jobs (settle the backlog, finalize orphan runs, retry
# unminted hexes) and the migration step run from here. They used to be
# Railway cron services against the Railway database; that database is gone
# and those services are asleep, so without the scripts in the image there
# is nowhere left to run them. tsx and drizzle-kit are already present as
# non-dev dependencies.
COPY --from=builder /app/scripts ./scripts
# tsx resolves the `@/...` imports through tsconfig paths, and the files
# under lib/ import each other that way. Without it `runs:settle-backlog`
# dies in resolveTsPathsSync while `runs:finalize-orphans`, which only
# uses relative imports, runs fine. Verified on the VPS, 29 Oct 2026.
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
CMD ["npm", "start"]
