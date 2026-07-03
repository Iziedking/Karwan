# syntax=docker/dockerfile:1.7

# ============================================================================
# Karwan frontend image — LOCAL TESTING ONLY.
#
# Production frontend ships via Vercel; this image exists so the full stack
# can run on one machine (docker-compose.local.yml) before a push fires the
# CI/CD pipeline. Build context is the REPO ROOT (the workspace lockfile
# lives there); the sibling Dockerfile.dockerignore scopes the context.
#
# NEXT_PUBLIC_BACKEND_URL is baked at build time (Next.js inlines public env
# into the client bundle), so the compose file passes it as a build arg.
# ============================================================================

FROM node:20-alpine

WORKDIR /app

# Workspace manifests first so the dep layer caches across source changes.
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/

RUN npm ci --workspace=frontend --include-workspace-root

COPY frontend frontend

ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:9091
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
# SME Trades surfaces + the business-registration web3 path are gated on these
# NEXT_PUBLIC vars, inlined at build. Default SME on for local testing so the
# new surfaces are visible; the registry address is passed from the .env.
ARG NEXT_PUBLIC_SME_TRADES_ENABLED=1
ENV NEXT_PUBLIC_SME_TRADES_ENABLED=$NEXT_PUBLIC_SME_TRADES_ENABLED
ARG NEXT_PUBLIC_BUSINESS_REGISTRY_ADDR=
ENV NEXT_PUBLIC_BUSINESS_REGISTRY_ADDR=$NEXT_PUBLIC_BUSINESS_REGISTRY_ADDR
# Market scout panel gate. Off by default (ships inert); flip to 1 alongside the
# backend SCOUT_ENABLED when the paid scout goes live.
ARG NEXT_PUBLIC_SCOUT_ENABLED=0
ENV NEXT_PUBLIC_SCOUT_ENABLED=$NEXT_PUBLIC_SCOUT_ENABLED
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm --prefix frontend run build

ENV NODE_ENV=production
EXPOSE 3000

# Local-testing image, but no reason to serve as root even here.
RUN chown -R node:node /app
USER node

WORKDIR /app/frontend
CMD ["npm", "start"]
