FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
# apps/web/lib/trpc-types.ts type-only imports AppRouter directly from
# apps/api/src/routers/index.ts (the standard tRPC monorepo pattern for
# end-to-end type safety without a separate published types package) — that
# transitively touches every router file, so `next build`'s type check
# needs apps/api's own dependencies (and its @pubflow/db dependency)
# resolvable too, even though none of this ships in the browser bundle.
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile

FROM deps AS development
COPY . .
WORKDIR /app/apps/web
CMD ["pnpm", "dev"]

FROM deps AS production
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time by
# `next build` — setting them as container env vars at runtime (e.g. via a
# Kubernetes ConfigMap) has zero effect on the browser bundle. They must be
# real build args, passed in by whatever builds this image (see
# .github/workflows/ci.yml's "Build and push Web image" step).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_KEYCLOAK_URL
ARG NEXT_PUBLIC_KEYCLOAK_REALM
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_KEYCLOAK_URL=$NEXT_PUBLIC_KEYCLOAK_URL \
    NEXT_PUBLIC_KEYCLOAK_REALM=$NEXT_PUBLIC_KEYCLOAK_REALM \
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=$NEXT_PUBLIC_KEYCLOAK_CLIENT_ID \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
# @pubflow/db's types come from a generated Prisma client (packages/db/generated,
# not checked into git) — needed for the same transitive trpc-types.ts reason
# as the deps-stage COPYs above. apps/api/Dockerfile does this same step
# before its own build.
RUN pnpm --filter @pubflow/db db:generate
RUN pnpm --filter @pubflow/web build
EXPOSE 3000
# Monorepo workspace builds mirror the repo-relative path in the standalone
# output (apps/web/.next/standalone/apps/web/server.js), not a flat
# .next/standalone/server.js — verified with a real local build, not assumed.
CMD ["node", "apps/web/.next/standalone/apps/web/server.js"]
