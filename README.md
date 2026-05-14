# PubFlow — End-to-End Publishing Platform

Open-source SaaS for journals and book publishers.
Submission → Peer Review → Copy Editing → Artwork → Typesetting → Publish

---

## Quick Start (Windows)

### Prerequisites — install these first
1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) — open it and wait for green "Engine running"
2. [Node.js 22 LTS](https://nodejs.org/)
3. [Git](https://git-scm.com/downloads)
4. Open PowerShell and run: `npm install -g pnpm`

### Setup — run these commands in order

```powershell
# 1. Enter the project folder (adjust path to where you put it)
cd D:\F-Drive\Authoring\pubflow_fresh

# 2. Copy environment file
copy .env.example .env

# 3. Open .env in VS Code and replace all CHANGE_ME values
#    Generate secrets with:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Install all dependencies
pnpm install

# 5. Start all Docker services (first time takes 5-10 minutes)
pnpm docker:dev

# 6. Wait for Docker to be ready, then run database setup
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 7. Start the apps
pnpm dev
```

### URLs once running

| Service         | URL                       | Login                              |
|-----------------|---------------------------|------------------------------------|
| Web App         | http://localhost:3000     | Keycloak login                     |
| API Health      | http://localhost:3001/health | Should show {"status":"ok"}     |
| Keycloak Admin  | http://localhost:8080     | admin / your KEYCLOAK_ADMIN_PASSWORD |
| MinIO Files     | http://localhost:9001     | pubflow_minio / pubflow_minio_secret |
| Emails (dev)    | http://localhost:8025     | All emails appear here             |
| Penpot Design   | http://localhost:3449     | Register on first visit            |
| Meilisearch     | http://localhost:7700     | Search dashboard                   |

---

## Save progress to GitHub

```powershell
git add .
git commit -m "your message here"
git push
```

---

## Project structure

```
pubflow_fresh/
├── apps/
│   ├── api/        ← Fastify backend + tRPC
│   ├── web/        ← Next.js 14 frontend
│   └── worker/     ← BullMQ background jobs
├── packages/
│   ├── db/         ← Prisma schema + migrations
│   ├── types/      ← Shared TypeScript types
│   └── config/     ← Shared TS/ESLint config
├── services/
│   ├── keycloak/   ← Auth config
│   ├── pandoc/     ← Document converter service
│   ├── latex/      ← PDF typesetting service
│   └── scribus/    ← Visual layout service
├── infra/
│   └── docker/     ← docker-compose.yml + nginx
└── .env.example    ← Copy this to .env
```

---

## Publishing pipeline

```
Author submits manuscript
    ↓
Editorial desk review
    ↓
Peer review (single/double blind)
    ↓
Copy editing (OnlyOffice)
    ↓
Artwork processing (DPI, ICC, CMYK)
    ↓
Typesetting (LaTeX / Scribus)
    ↓
Proof review + sign-off
    ↓
Published → PDF · EPUB · HTML · JATS XML · Print-on-demand
```
