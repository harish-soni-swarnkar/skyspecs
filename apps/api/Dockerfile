# Image for the API. Not needed for local dev (the brief says skip deployment) — it's here so the
# deploy story in OPERATING.md is a real, buildable thing rather than a paragraph.
# Build from the repo root:  docker build -f apps/api/Dockerfile -t skyspecs-api .

FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /app
# Copy just the manifests first so `pnpm install` caches when only source changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/tmdb/package.json packages/tmdb/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @skyspecs/api...

FROM node:20-alpine AS run
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production PORT=4000
# Bring the whole installed tree (root + per-package node_modules, workspace symlinks)...
COPY --from=deps /app ./
# ...then overlay source (the build context has no node_modules, so the copies above survive).
COPY packages/contracts ./packages/contracts
COPY packages/tmdb ./packages/tmdb
COPY apps/api ./apps/api
EXPOSE 4000
# The API runs via tsx; DATABASE_URL and TMDB_ACCESS_TOKEN come from the environment.
CMD ["pnpm", "--filter", "@skyspecs/api", "start"]
