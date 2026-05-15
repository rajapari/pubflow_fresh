# PUBFLOW — AI AGENT PROJECT SPECIFICATION
# Version: 1.0 | Phase 1 Complete | Phases 2-4 Pending
# This document is the single source of truth for all development decisions.
# An AI agent reading this file has everything needed to continue building.

---

## 1. PROJECT OVERVIEW

**Name:** PubFlow
**Purpose:** End-to-end SaaS publishing platform for academic journals and book publishers
**Model:** Subscription-based multi-tenant SaaS
**Licence:** AGPL-3.0
**Repository:** GitHub (Phase 1 committed)
**Local path:** D:\F-Drive\Authoring\pubflow_fresh

**What it does:**
Replaces Editorial Manager + InDesign + Photoshop + Acrobat + Word with one platform.
Covers the full pipeline: manuscript submission → peer review → copy editing →
artwork processing → typesetting → proof review → publish to web/print/ebook/XML.

---

## 2. MONOREPO STRUCTURE

```
pubflow_fresh/
├── apps/
│   ├── api/          Fastify 4 + tRPC v11 backend (Node.js 22, TypeScript ESM)
│   ├── web/          Next.js 14 App Router frontend (React 18, Tailwind CSS)
│   └── worker/       BullMQ job processor (Node.js 22, TypeScript ESM)
├── packages/
│   ├── db/           Prisma 5 schema + migrations + seed (PostgreSQL 16)
│   ├── types/        Shared Zod schemas + TypeScript types
│   └── config/       Shared tsconfig.base.json
├── services/
│   ├── keycloak/     realm-export.json (auth config)
│   ├── pandoc/       Dockerfile + server.py (Python Flask, Pandoc CLI)
│   ├── latex/        Dockerfile + server.py (Python Flask, XeLaTeX)
│   └── scribus/      Dockerfile.headless + server.py + scripts/layout.py
├── infra/
│   └── docker/
│       ├── docker-compose.yml   (14 services)
│       ├── nginx/nginx.conf
│       └── postgres/init.sql
└── .env                         (local only, never commit)
```

---

## 3. LOCKED TECHNOLOGY STACK (DO NOT CHANGE)

### Runtime
- Node.js 22 LTS
- TypeScript 5.5 (ESM modules, "module": "esnext", "moduleResolution": "bundler" for web)
- pnpm 9.12 workspaces + Turborepo 2.3

### Backend (apps/api)
- Fastify 4.28 with pluginTimeout: 60000
- tRPC v11 with @trpc/server/adapters/fastify
- @fastify/jwt v8 (declare module '@fastify/jwt' { interface FastifyJWT { user: AuthUser } })
- @fastify/cors, @fastify/helmet, @fastify/rate-limit, @fastify/multipart, @fastify/sensible
- Prisma 5.20 ORM
- BullMQ 5.12 (queue dispatcher)
- ioredis 5.4
- minio 8.0 (S3 client)
- dotenv 16 (loaded via tsx --env-file=../../.env)
- pino-pretty 11 (dev logging)
- zod 3.23

### Frontend (apps/web)
- Next.js 14.2 App Router
- React 18.3
- Tailwind CSS 3.4
- keycloak-js 24 (auth)
- @trpc/client + @trpc/react-query v11
- @tanstack/react-query v5
- sonner (toasts)
- lucide-react 0.439
- react-hook-form 7 + @hookform/resolvers

### Worker (apps/worker)
- BullMQ 5.12 workers
- dotenv (loaded via tsx --env-file=../../.env)
- nodemailer 6.9
- minio 8.0

### Database
- PostgreSQL 16 (Docker)
- Redis 7 (Docker, NO password in local dev)
- Meilisearch 1.10 (Docker)

### Auth
- Keycloak 24 (Docker)
- @fastify/jwt v8 with RS256 public key from Keycloak realm endpoint
- Auth plugin fetches key from: {KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}
- Graceful degradation: if Keycloak unreachable, API starts with placeholder secret

### File Storage
- MinIO (Docker, S3-compatible)
- Credentials: MINIO_ACCESS_KEY=pubflow_minio, MINIO_SECRET_KEY=pubflow_minio_secret
- Bucket: pubflow-files
- WOPI protocol bridge for OnlyOffice

### Layout/Typesetting Engines (Docker services)
- LaTeX/XeLaTeX: texlive Docker image, Python Flask REST wrapper on port 5001
- Scribus: Ubuntu 24.04 headless + Xvfb + Python Flask on port 5000
- Pandoc: Python 3.12 + pandoc CLI, Flask REST wrapper on port 4000

### Design Tools (Docker services)
- OnlyOffice Docs 8.1 (port 8081) — Word editing, WOPI connected to MinIO
- Penpot latest (port 3449) — cover and template design

### Infrastructure
- Docker Compose (local dev)
- GitHub Actions CI
- k3s Kubernetes + Helm (production — Phase 4)

---

## 4. ENVIRONMENT VARIABLES (complete list)

```
# Database
DATABASE_URL=postgresql://pubflow:pubflow_secret@localhost:5432/pubflow

# Redis (no password in local dev)
REDIS_URL=redis://localhost:6379/0

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=pubflow_minio
MINIO_SECRET_KEY=pubflow_minio_secret
MINIO_BUCKET=pubflow-files

# Keycloak
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=pubflow
KEYCLOAK_CLIENT_ID=pubflow-api
KEYCLOAK_CLIENT_SECRET=<generated>
KEYCLOAK_ADMIN_PASSWORD=Admin@PubFlow2025

# OnlyOffice
ONLYOFFICE_JWT_SECRET=<generated>

# Meilisearch
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_API_KEY=<generated>

# Penpot
PENPOT_SECRET_KEY=<generated>

# Email
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_FROM=noreply@pubflow.local

# Stripe
STRIPE_SECRET_KEY=sk_test_<key>
STRIPE_WEBHOOK_SECRET=whsec_<key>

# URLs
APP_URL=http://localhost:3000
API_URL=http://localhost:3001

# Service URLs
PANDOC_SERVICE_URL=http://localhost:4000
LATEX_SERVICE_URL=http://localhost:5001
SCRIBUS_SERVICE_URL=http://localhost:5000
IMAGE_SERVICE_URL=http://localhost:5002
```

---

## 5. DATABASE SCHEMA SUMMARY

All models are in: packages/db/prisma/schema.prisma

### Core models:
- Tenant (id, name, slug, plan, status, stripeCustomerId)
- TenantSettings (tenantId, primaryColor, citationStyle, enablePeerReview, doiPrefix)
- User (tenantId, keycloakId, email, firstName, lastName, role, status)
- Publication (tenantId, title, type:JOURNAL|BOOK|BOOK_SERIES|PROCEEDINGS, issn, isbn)
- Issue (publicationId, volume, number, year)
- Submission (tenantId, publicationId, authorId, title, abstract, keywords, status)
- Manuscript (submissionId, format, minioKey, version, isLatest)
- Review (submissionId, reviewerId, round, status, recommendation, comments)
- EditorialDecision (submissionId, editorId, decision, notes)
- Asset (submissionId, assetType, minioKey, dpi, colorMode, status)
- Output (submissionId, format, engine, minioKey, status, jobId)
- WorkflowLog (submissionId, fromStatus, toStatus, performedBy, note)
- Subscription (tenantId, stripeSubscriptionId, plan, status)

### Submission status state machine (VALID_TRANSITIONS in packages/types/src/submission.ts):
DRAFT → SUBMITTED → DESK_REVIEW → PEER_REVIEW → REVISION_REQUIRED → REVISED
→ ACCEPTED → COPY_EDITING → ARTWORK_PROCESSING → TYPESETTING → PROOF_REVIEW
→ APPROVED → PUBLISHED
Also: any active state → REJECTED or WITHDRAWN

### Key enums:
UserRole: SUPER_ADMIN, EDITOR_IN_CHIEF, SECTION_EDITOR, COPY_EDITOR,
          ARTWORK_EDITOR, TYPESETTER, PEER_REVIEWER, AUTHOR, READER
Plan: STARTER, PROFESSIONAL, ENTERPRISE
OutputFormat: PDF_PRINT, PDF_WEB, EPUB, HTML, JATS_XML, DOCX, BIBTEX, JSON_LD
LayoutEngine: LATEX, SCRIBUS, PANDOC, WEASYPRINT

---

## 6. API STRUCTURE (tRPC routers)

Entry: apps/api/src/routers/index.ts → appRouter
Routers: submission, publication, tenant, user
Procedures: publicProcedure, protectedProcedure, editorProcedure,
            chiefEditorProcedure, adminProcedure

### Existing routes (Phase 1 complete):
- submission.list (paginated, filtered by status/publication, role-scoped)
- submission.byId (full detail with relations)
- submission.create (validates publication ownership)
- submission.submit (DRAFT→SUBMITTED state machine)
- submission.makeDecision (chiefEditor only, triggers notifications)
- submission.getUploadUrl (presigned MinIO URL)
- publication.list
- publication.byId
- tenant.current
- user.me
- user.list

---

## 7. JOB QUEUES (BullMQ)

Queue names (QUEUES constant in packages/types/src/jobs.ts):
- pandoc: document format conversion
- latex: PDF compilation via XeLaTeX
- scribus: visual book/magazine layout
- image: artwork validation and processing
- notification: email sending via Nodemailer

Each processor in apps/worker/src/processors/:
- Updates Output/Asset status in DB (QUEUED→PROCESSING→COMPLETED|FAILED)
- Downloads input from MinIO
- Calls the relevant Docker service via HTTP
- Uploads result to MinIO
- Updates DB with output key and file size

---

## 8. FRONTEND STRUCTURE (Next.js App Router)

```
apps/web/app/
├── layout.tsx              Root layout with Providers + Toaster
├── page.tsx                Redirects to /dashboard
├── globals.css             Tailwind base
├── globals.css.d.ts        declare module '*.css'
└── dashboard/
    ├── layout.tsx          Auth guard + Sidebar + TopBar
    ├── page.tsx            Dashboard stats + recent submissions
    └── submissions/
        └── page.tsx        Submissions list with filter pills
```

Key components:
- components/providers.tsx   tRPC + React Query providers
- components/layout/Sidebar.tsx
- components/layout/TopBar.tsx
- components/ui/StatusBadge.tsx
- hooks/useAuth.ts           Keycloak-js integration
- lib/utils.ts               cn(), formatDate(), STATUS_LABELS, STATUS_COLORS
- lib/trpc-types.ts          Re-exports AppRouter type from api

### Auth flow:
1. useAuth hook initialises keycloak-js with check-sso on mount
2. If not authenticated, calls kc.login() → redirects to Keycloak
3. On return, token stored in localStorage as 'pubflow_token'
4. tRPC httpBatchLink reads token from localStorage and adds Bearer header
5. API auth plugin verifies JWT, looks up user in DB, attaches to req.user

---

## 9. PHASE STATUS

### Phase 1 — Foundation (COMPLETE ✅)
- Monorepo scaffold (Turborepo + pnpm)
- Docker Compose with all 14 services
- PostgreSQL schema + Prisma migrations + seed data
- Keycloak realm with all 9 roles
- MinIO bucket creation
- Redis connection
- BullMQ queue setup
- Fastify API with all plugins (auth, minio, redis, bull, trpc)
- tRPC routers: submission, publication, tenant, user
- Next.js shell with auth guard, sidebar, dashboard page
- BullMQ worker with all 5 processors (stubs calling service URLs)
- GitHub Actions CI
- All apps running: web:3000, api:3001, worker

### Phase 2 — Editorial Core (PENDING)
### Phase 3 — Production Pipeline (PENDING)
### Phase 4 — Publishing + Launch (PENDING)

---

## 10. PHASE 2 — EDITORIAL CORE (build next)

**Goal:** Complete submission → peer review workflow, OnlyOffice editing, author portal

### 2.1 Submission portal (apps/web/app/dashboard/submissions/)
Files to create:
- new/page.tsx         Multi-step submission form
- [id]/page.tsx        Submission detail view
- [id]/edit/page.tsx   Edit draft submission

Form fields (CreateSubmissionSchema from packages/types):
- publicationId (select from tenant publications)
- title (min 10 chars)
- abstract (min 50 chars)
- keywords (1-10 tags)
- coAuthors (dynamic array: name, email, affiliation, orcid)
- manuscript file upload (DOCX, LaTeX, Markdown, ODT)
- figures upload (JPEG, PNG, TIFF, EPS, SVG)

File upload flow:
1. Call trpc.submission.getUploadUrl → get presigned MinIO URL
2. PUT file directly to MinIO from browser using presigned URL
3. Call trpc.submission.confirmUpload to record manuscript in DB
4. Worker auto-queues Pandoc normalisation job

### 2.2 OnlyOffice editor integration
File: apps/web/app/dashboard/submissions/[id]/edit/page.tsx

OnlyOffice embed pattern:
```typescript
// The OnlyOffice Document Server runs at http://localhost:8081
// Config object passed to DocsAPI.DocEditor:
const config = {
  document: {
    fileType: 'docx',
    key: manuscriptId,           // unique version key
    title: submission.title,
    url: presignedMinioUrl,      // MinIO presigned GET URL
  },
  editorConfig: {
    callbackUrl: `${API_URL}/wopi/callback/${manuscriptId}`,
    user: { id: user.id, name: user.firstName + ' ' + user.lastName },
    customization: { autosave: true, forcesave: true },
  },
  token: onlyofficeJwt,         // JWT signed with ONLYOFFICE_JWT_SECRET
}
```

New API route needed: apps/api/src/routes/wopi.ts
- GET  /wopi/files/:key        CheckFileInfo
- GET  /wopi/files/:key/contents  GetFile (streams from MinIO)
- POST /wopi/files/:key/contents  PutFile (saves back to MinIO, creates new Manuscript version)
- POST /wopi/callback/:id      OnlyOffice save callback

### 2.3 Editorial workflow dashboard
Files to create:
- apps/web/app/dashboard/editorial/page.tsx
  - Tabs: Pending Review / Active Reviews / Decisions
  - Table of submissions awaiting action
  - Assign reviewer button (opens modal)
  - Make decision button (accept/reject/revise modal)

New tRPC routes needed in apps/api/src/routers/:
- review.ts
  - review.assignReviewer (editorProcedure) → creates Review record, sends REVIEW_INVITED notification
  - review.list (protectedProcedure) → reviewer sees their assignments
  - review.submit (protectedProcedure) → reviewer submits recommendation
  - review.acceptInvitation (protectedProcedure) → INVITED→ACCEPTED
  - review.declineInvitation (protectedProcedure) → INVITED→DECLINED

### 2.4 Notifications (complete the processor)
Update apps/worker/src/processors/notification.ts:
- Resolve recipient email addresses from DB (currently sends to empty array)
- For SUBMISSION_RECEIVED: query all EDITOR_IN_CHIEF users in tenant
- For REVIEW_INVITED: use reviewer email from Review.reviewer relation
- For DECISION_MADE: use submission.author.email

### 2.5 Author dashboard
- apps/web/app/dashboard/submissions/[id]/page.tsx
  Shows: current status badge, workflow timeline, reviewer comments (when released),
  file versions, upload revised manuscript button

### 2.6 LanguageTool integration
In the OnlyOffice editor, LanguageTool runs as a self-hosted service at localhost:8082.
Add a tRPC route: grammar.check(text: string) → calls http://localhost:8082/v2/check
Display results as inline suggestions in the submission detail view.

---

## 11. PHASE 3 — PRODUCTION PIPELINE (after Phase 2)

**Goal:** Artwork processing, typesetting, proof review

### 3.1 Artwork processing stage
Files to create:
- apps/web/app/dashboard/artwork/page.tsx
  List of submissions in ARTWORK_PROCESSING status
- apps/web/app/dashboard/artwork/[id]/page.tsx
  Figure grid: thumbnail, DPI badge, colour mode badge, approve/reject per figure
  miniPaint embed for in-browser editing (MIT, embed as iframe from CDN)

New tRPC routes: apps/api/src/routers/asset.ts
- asset.list(submissionId)
- asset.getUploadUrl(submissionId, filename, mimeType, size)
- asset.validate(assetId) → queues IMAGE job
- asset.approve(assetId)
- asset.reject(assetId, reason)
- asset.updateAltText(assetId, altText)

Complete the image worker (apps/worker/src/processors/image.ts):
The IMAGE_SERVICE_URL points to a Sharp/GIMP microservice.
Create services/image/Dockerfile + server.py:
- Uses Sharp (via node-canvas or Python pillow) for DPI check, format conversion
- Checks: DPI >= 300 for print, colorMode detection, ICC profile presence
- Returns: { processed: base64, metadata: {dpi, width, height, colorMode}, errors: [], mimeType }

### 3.2 Typesetting stage
Files to create:
- apps/web/app/dashboard/typesetting/page.tsx
  List submissions in TYPESETTING status
- apps/web/app/dashboard/typesetting/[id]/page.tsx
  Engine selector (LaTeX / Scribus / Pandoc)
  Trigger conversion button per output format
  Job status polling (useQuery with refetchInterval: 3000)
  Download links for completed outputs

New tRPC routes: apps/api/src/routers/output.ts
- output.list(submissionId)
- output.triggerConversion(submissionId, format, engine) → queues job
- output.getDownloadUrl(outputId) → presigned MinIO URL
- output.getJobStatus(outputId) → polls DB for status

Complete the service wrappers:
- services/pandoc/server.py is complete (converts docx/latex/md → html/epub/jats/pdf)
- services/latex/server.py is complete (compiles .tex → PDF)
- services/scribus/ needs Scribus installed in Docker + Python Flask wrapper

### 3.3 Proof review stage
Files to create:
- apps/web/app/dashboard/proofing/page.tsx
- apps/web/app/dashboard/proofing/[id]/page.tsx
  PDF.js viewer (embed from CDN: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.js)
  Annotorious overlay for inline annotations
  Sign-off button → sets submissionStatus to APPROVED
  Request changes button → sends back to TYPESETTING

New tRPC routes:
- proof.getProofUrl(submissionId) → presigned URL for latest PDF_PRINT output
- proof.signOff(submissionId) → PROOF_REVIEW→APPROVED + WorkflowLog
- proof.requestChanges(submissionId, notes) → PROOF_REVIEW→TYPESETTING + notification

---

## 12. PHASE 4 — PUBLISHING + LAUNCH (after Phase 3)

**Goal:** Multi-channel publish, DOI, PubMed, public reader portal, billing, deployment

### 4.1 Publishing pipeline
New tRPC route: publish.article(submissionId)
Steps executed in sequence:
1. Set submission status to PUBLISHED
2. POST to CrossRef API for DOI registration (if doiPrefix configured in TenantSettings)
3. FTP deposit of JATS XML to PubMed Central (if PMC credentials configured)
4. Regenerate HTML output → save as static page in MinIO public folder
5. Trigger RSS feed regeneration for journal
6. If print-on-demand enabled: POST to Lulu API or IngramSpark API

### 4.2 Public reader portal
New Next.js route group: apps/web/app/(public)/
- [tenantSlug]/page.tsx          Journal homepage
- [tenantSlug]/articles/page.tsx Article listing
- [tenantSlug]/articles/[doi]/page.tsx  Article full text (HTML output from MinIO)
These routes are public (no auth required), use publicProcedure tRPC calls.
OAI-PMH endpoint: apps/api/src/routes/oai.ts → GET /oai?verb=ListRecords

### 4.3 Subscription billing (Stripe)
Webhook handler: apps/api/src/routes/webhooks.ts
Handle events:
- checkout.session.completed → create Subscription record, update Tenant.plan
- customer.subscription.updated → update Subscription status
- customer.subscription.deleted → downgrade Tenant.plan to STARTER

New tRPC routes: billing.ts
- billing.createCheckoutSession(plan) → Stripe checkout URL
- billing.getPortalUrl() → Stripe customer portal URL
- billing.getCurrentPlan() → returns Subscription with status

Frontend: apps/web/app/dashboard/settings/billing/page.tsx

### 4.4 Tenant onboarding
New pages:
- apps/web/app/(public)/signup/page.tsx  Self-service registration form
- apps/web/app/dashboard/settings/page.tsx  Journal settings (logo, colours, ISSN, DOI prefix)
- apps/web/app/dashboard/settings/users/page.tsx  Invite users, assign roles

New tRPC routes:
- tenant.update(settings) → update TenantSettings
- tenant.inviteUser(email, role) → creates User with INVITED status, sends email
- tenant.updateUserRole(userId, role)
- tenant.removeUser(userId)

### 4.5 Production deployment (Kubernetes)
Files to create in infra/k8s/:
- namespace.yaml
- deployment-api.yaml
- deployment-web.yaml
- deployment-worker.yaml
- service-api.yaml
- service-web.yaml
- ingress.yaml (nginx ingress controller)
- configmap.yaml (non-secret env vars)
- secret.yaml (template — actual secrets via kubectl create secret)

Files to create in infra/helm/:
- Chart.yaml
- values.yaml (enterprise self-hosted defaults)
- templates/ (all k8s manifests as Helm templates)

CI/CD (already scaffolded in .github/workflows/ci.yml):
Add deploy job: on push to main → build Docker images → push to registry → kubectl rollout

---

## 13. CODING CONVENTIONS (follow exactly)

### TypeScript
- All files use ESM: import/export, no require()
- Worker and API: "module": "NodeNext", "moduleResolution": "NodeNext"
- Web: "module": "esnext", "moduleResolution": "bundler"
- All imports from workspace packages use workspace:* in package.json
- Type imports use: import type { X } from 'y'
- Zod for all input validation (defined in packages/types, imported in routers)

### API patterns
- All business logic in tRPC routers (not Fastify routes)
- Fastify routes only for: /health, /webhooks (Stripe), /wopi (OnlyOffice)
- Every tRPC mutation that changes submission status must:
  1. Validate the transition with isValidTransition() from packages/types
  2. Create a WorkflowLog record
  3. Queue a NOTIFICATION job
- All DB queries filter by tenantId to enforce tenant isolation
- AUTHOR role can only see their own submissions (enforced in every list query)

### Frontend patterns
- All pages are 'use client' (no server components yet — added in Phase 4)
- Data fetching only via trpc.xxx.useQuery() and trpc.xxx.useMutation()
- No direct fetch() calls in components
- Tailwind only — no inline styles, no CSS modules
- Error states: show inline error message, not console.error
- Loading states: always show spinner, never blank screen

### File naming
- React components: PascalCase.tsx
- Hooks: camelCase starting with use
- Utilities: camelCase.ts
- tRPC routers: camelCase.ts (matches the router key in appRouter)

---

## 14. KNOWN ISSUES (resolved in Phase 1)

1. tsx --env-file flag: must be AFTER 'watch' keyword
   Correct: tsx watch --env-file=../../.env src/server.ts

2. @fastify/jwt issuer: do NOT put issuer inside verify block (type error)
   Correct: verify: { algorithms: ['RS256'] } only

3. FastifyJWT user type conflict: extend '@fastify/jwt' not 'fastify'
   Correct: declare module '@fastify/jwt' { interface FastifyJWT { user: AuthUser } }

4. Prisma enums: each value MUST be on its own line (no inline enums)

5. Prisma relations: both sides must be declared
   Tenant must list submissions: Submission[] alongside users, publications

6. PostgreSQL port exposure: docker-compose must map 5432:5432 explicitly
   The port only appears in PORTS column when host:container mapping exists

7. pnpm dev reports "Failed" for long-running tasks — this is normal Turbo behaviour
   The apps ARE running despite the Failed label

8. globals.css TypeScript error: create globals.css.d.ts with declare module '*.css'

9. web tsconfig: use "moduleResolution": "bundler" not "node" or "node10"

---

## 15. SERVICE PORTS (local development)

| Service | Port | URL |
|---|---|---|
| Next.js web | 3000 | http://localhost:3000 |
| Fastify API | 3001 | http://localhost:3001 |
| Keycloak | 8080 | http://localhost:8080 |
| OnlyOffice | 8081 | http://localhost:8081 |
| LanguageTool | 8082 | http://localhost:8082 |
| PostgreSQL | 5432 | postgresql://pubflow:pubflow_secret@localhost:5432/pubflow |
| Redis | 6379 | redis://localhost:6379/0 (no password in dev) |
| MinIO API | 9000 | http://localhost:9000 |
| MinIO Console | 9001 | http://localhost:9001 |
| Meilisearch | 7700 | http://localhost:7700 |
| Mailpit SMTP | 1025 | smtp://localhost:1025 |
| Mailpit UI | 8025 | http://localhost:8025 |
| Penpot | 3449 | http://localhost:3449 |
| Pandoc service | 4000 | http://localhost:4000 |
| LaTeX service | 5001 | http://localhost:5001 |
| Scribus service | 5000 | http://localhost:5000 |

---

## 16. COMMANDS REFERENCE

```bash
# Install
pnpm install

# Start Docker services
docker compose -f infra/docker/docker-compose.yml up -d

# Database
pnpm db:generate       # generate Prisma client
pnpm db:migrate:dev    # create + apply migrations (dev)
pnpm db:migrate        # apply existing migrations (CI/prod)
pnpm db:seed           # seed demo tenant + publication

# Dev (all apps)
pnpm dev

# Individual apps
pnpm --filter @pubflow/api dev
pnpm --filter @pubflow/web dev
pnpm --filter @pubflow/worker dev

# Git
git add .
git commit -m "message"
git push
```

---

## 17. PHASE 2 FILE CHECKLIST (create these files next)

### New files to create:
- [ ] apps/web/app/dashboard/submissions/new/page.tsx
- [ ] apps/web/app/dashboard/submissions/[id]/page.tsx
- [ ] apps/web/app/dashboard/editorial/page.tsx
- [ ] apps/api/src/routers/review.ts
- [ ] apps/api/src/routes/wopi.ts
- [ ] apps/web/components/forms/SubmissionForm.tsx
- [ ] apps/web/components/forms/ReviewForm.tsx
- [ ] apps/web/components/ui/FileUpload.tsx
- [ ] apps/web/components/ui/WorkflowTimeline.tsx

### Existing files to update:
- [ ] apps/api/src/routers/index.ts  (add review router)
- [ ] apps/api/src/server.ts          (add wopi routes)
- [ ] apps/worker/src/processors/notification.ts  (resolve recipient emails from DB)
- [ ] apps/web/app/dashboard/submissions/page.tsx  (add link to [id] page)
