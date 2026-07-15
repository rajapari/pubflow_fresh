# Production Deploy Runbook

**Status:** All 3 phases complete. Covers auth (Keycloak), document editing
(OnlyOffice), the core api/web/worker apps, the full bot pipeline
(pandoc/latex/scribus/preflight/image/idml), LanguageTool, and the data
layer via managed cloud services. See [Known gaps](#known-gaps-not-yet-covered)
for what's still genuinely outstanding (mostly things that need your actual
cluster to exist before they can be verified end-to-end).

Provider used throughout: **DigitalOcean**, chosen specifically because its
Spaces object storage is genuinely S3-API-compatible — `apps/api/src/plugins/minio.ts`
and `apps/worker/src/lib/storage.ts` need zero code changes to point at it.
Any other provider with an S3-compatible object store (AWS, Linode) works the
same way; GCP/Azure's native storage does not (see the provider comparison
this was decided from, in conversation history if you need it again).

---

## 1. Prerequisites — create these first

All in the DigitalOcean dashboard:

1. **DOKS cluster** (Kubernetes → Create Cluster). 1-2 "Basic" nodes is
   enough to start.
2. **Managed Database → PostgreSQL** cluster.
3. **Managed Database → Redis/Valkey** cluster.
4. **Spaces bucket** (Spaces Object Storage → Create Bucket) — create the
   bucket itself now; `apps/worker/src/lib/storage.ts`'s `ensureBucket()`
   only creates it if missing, and doing it manually here avoids relying on
   that path's hardcoded `us-east-1` region string, which DO Spaces ignores
   anyway since the bucket already exists.
5. **Spaces API key** (API → Spaces Keys, *not* your general DO API token —
   separate credential).
6. A **domain you control**, for four subdomains: `app.`, `api.`, `auth.`,
   `docs.` (defaults below assume `pubflow.io` — change to match yours).

---

## 2. Cluster add-ons

The Helm chart's Ingress assumes both of these already exist — it doesn't
install them.

```bash
# ingress-nginx
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

# cert-manager (TLS via Let's Encrypt)
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true
```

Then create a `ClusterIssuer` named `letsencrypt-prod` (matches
`infra/helm/values.yaml`'s `ingress.certIssuer`) — cert-manager's own docs
have the exact manifest; it needs your email and the ACME production server
URL.

Get `ingress-nginx`'s external IP (`kubectl get svc -n ingress-nginx`) and
point all four subdomains at it in your DNS provider.

---

## 3. Get the kubeconfig

```bash
doctl auth init                                  # one-time, needs a DO API token
doctl kubernetes cluster kubeconfig save <cluster-name>
```

That updates your local `~/.kube/config`. To get it into GitHub Actions:

```bash
# GitHub CLI, or paste manually into the repo secret
gh secret set KUBECONFIG < ~/.kube/config
```

Repo secret name must be exactly `KUBECONFIG` — `.github/workflows/ci.yml`'s
deploy job checks for it and skips the k8s steps entirely (not a failure)
until it's present.

---

## 4. Fill in real (non-secret) values

Edit `infra/helm/values.yaml` directly and commit it — these are stable infra
facts, not per-deploy secrets:

- `config.postgresHost` — your managed Postgres cluster's hostname
- `config.postgresPort` — usually `25060` for DO, check your cluster's connection details
- `config.minioEndpoint` — your Spaces region endpoint, e.g. `nyc3.digitaloceanspaces.com`
- `ingress.hosts.*` — if you're not using `pubflow.io`, change all four hostnames
- `config.appUrl` / `config.apiUrl` / `config.keycloakUrl` / `config.onlyofficeUrl` — must match `ingress.hosts.*`

## 5. Set the GitHub Secrets

Repo Settings → Secrets and variables → Actions → **Secrets**:

| Secret | Value |
|---|---|
| `KUBECONFIG` | Full kubeconfig YAML (step 3) |
| `PROD_DATABASE_URL` | `postgresql://pubflow:PASSWORD@HOST:25060/pubflow?sslmode=require` |
| `PROD_POSTGRES_PASSWORD` | Same password as embedded above — Keycloak needs it as a discrete field |
| `PROD_REDIS_URL` | Your managed Redis connection string (DO gives you this directly) |
| `PROD_MINIO_ACCESS_KEY` / `PROD_MINIO_SECRET_KEY` | Spaces API key from step 1.5 |
| `PROD_KEYCLOAK_ADMIN_PASSWORD` | Pick a strong password — this is the Keycloak realm admin |
| `PROD_ONLYOFFICE_JWT_SECRET` | Any random 32+ char string — must be unique per deployment |

Optional (leave unset if you don't have them yet — the app runs fine without
any of these, matching local dev's graceful-degradation pattern):
`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`CROSSREF_LOGIN_ID`, `CROSSREF_LOGIN_PASSWORD`, `LULU_CLIENT_KEY`,
`LULU_CLIENT_SECRET`, `PMC_FTP_USERNAME`, `PMC_FTP_PASSWORD`, `SENTRY_DSN`.

Repo Settings → Secrets and variables → Actions → **Variables** (these end up
in the public browser bundle by design, so they're Variables, not Secrets):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.<your-domain>` |
| `NEXT_PUBLIC_KEYCLOAK_URL` | `https://auth.<your-domain>` |
| `NEXT_PUBLIC_KEYCLOAK_REALM` | `pubflow` |
| `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID` | `pubflow-web` |

If left unset, CI falls back to the `pubflow.io` defaults baked into the
workflow — fine only if that happens to be your real domain.

---

## 6. Deploy

Push to `master`/`main`. CI runs three build stages before Helm ever runs:
`api`/`web`/`worker` images (the `deploy` job itself), then a separate
`build-microservices` job (matrix build) pushes all six bot-pipeline images
(`pandoc`, `latex`, `scribus`, `preflight`, `image`, `idml`) — `deploy` waits
on that job before running `helm upgrade --install`. Watch:

```bash
kubectl get pods -n pubflow -w
```

**First deploy takes longer than usual** — Keycloak's realm import and
OnlyOffice's font-cache generation (the same slow first-boot behavior
documented for local dev in `infra/docker/docker-compose.yml`) both happen
on first start, and `latex`'s image is large (`texlive-lang-all`) so its
first pull can take a while too. The Helm timeout is set to 10 minutes to
give all nine deployments room.

---

## 7. Verify

- `https://auth.<domain>` — Keycloak login screen loads
- `https://app.<domain>` — landing page loads, signup flow reaches Keycloak
- `https://api.<domain>/health` — returns 200
- `https://docs.<domain>/healthcheck` — OnlyOffice health endpoint

If `pubflow-onlyoffice` or `pubflow-keycloak` pods are stuck in
`CreateContainerConfigError`, a required secret is missing — check
`kubectl describe pod` for which one.

---

## Known gaps

- **None of this has run against a real cluster yet.** Every template is
  verified with `helm lint`/`helm template` (structural correctness, every
  config/secret cross-reference checked by script) and the web image is
  verified with a real local Docker build + boot + HTTP requests — but the
  actual `helm upgrade` against a live DOKS cluster, the Keycloak realm
  import, OnlyOffice's PVC behavior, and the bot-pipeline services actually
  receiving and completing real jobs from the worker are all still
  unverified until your cluster exists. Treat the first real deploy as a
  first real test, not a formality.
- **SMTP has no auth support.** `apps/worker/src/processors/notification.ts`
  only reads `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM` — no username/password.
  Most production relays (SendGrid, Postmark, SES) require auth. Untested
  because local dev uses Mailpit, which doesn't need it either.
- **Crossref defaults to test mode** (`config.crossrefTestMode: "true"`) —
  deliberately, until you've verified real deposits work. Flip manually once
  confirmed, not as part of a routine deploy.
- **Keycloak realm import runs on every restart** (`--import-realm` flag).
  Keycloak's own import behavior is idempotent for an existing realm, but
  this hasn't been verified against admin-made changes surviving a pod
  restart — worth confirming before you rely on the Keycloak admin console
  for anything you can't afford to lose.
