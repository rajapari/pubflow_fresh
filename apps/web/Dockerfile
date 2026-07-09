FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile

FROM deps AS development
COPY . .
WORKDIR /app/apps/web
CMD ["pnpm", "dev"]

FROM deps AS production
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @pubflow/web build
EXPOSE 3000
CMD ["node", "apps/web/.next/standalone/server.js"]
