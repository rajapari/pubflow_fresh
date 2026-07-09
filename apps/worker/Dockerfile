FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS development
COPY . .
WORKDIR /app/apps/worker
CMD ["pnpm", "dev"]

FROM deps AS production
COPY . .
RUN pnpm --filter @pubflow/db db:generate && pnpm --filter @pubflow/worker build
CMD ["node", "apps/worker/dist/worker.js"]
