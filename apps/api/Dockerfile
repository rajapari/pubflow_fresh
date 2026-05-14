FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
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
