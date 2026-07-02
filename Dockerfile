# syntax=docker/dockerfile:1.7

# ============================================================================
# Karwan backend image — multi-stage.
#
# Stage 1 (builder): installs all workspace deps (incl. devDependencies for
# tsc + tsx) and compiles TypeScript to JS under backend/dist.
#
# Stage 2 (runtime): pulls only production deps and the compiled dist. The
# final image runs `node backend/dist/index.js` directly — no `tsx` needed at
# runtime, so the runtime image stays small.
#
# Contracts and frontend are NOT included; the frontend ships via Vercel and
# contracts deploy from the dev machine. This image is the API service only.
# ============================================================================

# ============ builder ============
FROM node:20-alpine AS builder

WORKDIR /app

# Workspace manifests. Copying these first lets Docker cache the dep install
# layer when source changes but lockfile doesn't.
COPY package.json package-lock.json ./
COPY backend/package.json backend/

# Full install (devDeps included) for the workspace. The legacy peer-deps
# fallback handles minor SemVer mismatches between Vercel SDK + Anthropic
# provider; in normal cases npm ci works fine.
RUN npm ci --workspace=backend --include-workspace-root

# Sources + tsconfig
COPY backend/tsconfig.json backend/
COPY backend/src backend/src

# Compile to backend/dist
RUN npm --prefix backend run build

# ============ runtime ============
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8787

# postgresql-client gives us pg_dump + psql for the in-container backup
# script (dist/scripts/backup-karwan.js + restore-karwan.js). tar + gzip
# are built into the alpine base. The combined footprint is ~15 MB —
# negligible vs the cost of needing a separate backup container or
# host-side tooling. The script also runs as a one-shot via
# `docker compose exec`, so the binaries stay idle until cron fires.
RUN apk add --no-cache postgresql-client

# Install ONLY production deps. Smaller image, no tsc/tsx at runtime.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci --omit=dev --workspace=backend --include-workspace-root \
    && npm cache clean --force

# Compiled output
COPY --from=builder /app/backend/dist backend/dist

# Standalone scripts that the host cron invokes via
# `docker compose exec -T karwan-api node scripts/<name>.mjs`. Plain ESM,
# no compile step. Keep small + use only deps already installed for the
# backend (viem, dotenv).
COPY scripts backend/scripts

# Flat-file data dir (mounted from the host in docker-compose). The fallback
# stores survive container restarts when Postgres isn't configured. With
# DATABASE_URL set, this stays mostly empty.
RUN mkdir -p backend/data && chown -R node:node /app

# Drop root: a compromised dependency in this container should not get uid 0.
# The bind-mounted host dirs must be owned by uid 1000 (the deploy workflow
# chowns ~/karwan/data before rolling the service); image-internal paths are
# chowned above.
USER node

# wget ships in node:20-alpine. Used by HEALTHCHECK + Caddy probes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health > /dev/null || exit 1

EXPOSE 8787

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
