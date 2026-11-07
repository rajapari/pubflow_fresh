FROM node:22-alpine AS base
# Prisma's query-engine binary dynamically links libssl even on the musl
# target (schema.prisma's binaryTargets) — Alpine doesn't ship it by
# default. Without this, the image boots (nothing imports it at startup)
# but every real database query fails: "Error loading shared library
# libssl.so.1.1: No such file or directory" — confirmed by actually
# running this image and issuing a query, not assumed from the warning.
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS development
COPY . .
WORKDIR /app/apps/api
CMD ["pnpm", "dev"]

FROM deps AS production
COPY . .
RUN pnpm --filter @pubflow/db db:generate && pnpm --filter @pubflow/api build
CMD ["node", "apps/api/dist/server.js"]
