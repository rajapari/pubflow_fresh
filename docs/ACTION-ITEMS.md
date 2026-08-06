# PubFlow — Owner Action Items

**As of 2026-07-19.** Phases A–D of the bot pipeline are built, tested (worker 101 / api 33 / python 42), and green in CI. Everything below is what only the **owner** can do: credentials, memberships, and decisions. Ordered by impact.

## 1. ~~Activate the AI bots~~ — done (2026-08-06)
Dev key (`pubflow-dev-worker`) live in local `.env` as `ANTHROPIC_API_KEY_DEV`, verified with a real API call. Prod key (`pubflow-prod-worker`) created — still needs the `ANTHROPIC_API_KEY_PROD` GitHub repo secret added (see item 5) before it's live in the cluster.

## 2. ~~Similarity provider~~ — done (2026-08-06)
Chose Copyleaks. Live adapter built: `apps/worker/src/lib/copyleaks.ts` (login + submit) and the SIMILARITY job in `editorialProcessor` submit the latest manuscript on SUBMITTED. Results arrive asynchronously via `POST /webhooks/copyleaks/:submissionId/:token/:status` (`apps/api/src/routes/webhooks.ts`) — Copyleaks doesn't sign webhooks, so a per-scan token (only its SHA-256 hash is ever persisted) authenticates the callback instead. `similarityReport` goes `pending` → `done` (score + up to 50 matched sources) or `error`.

Verified live: real `COPYLEAKS_API_KEY`/`COPYLEAKS_EMAIL` login + submit succeeded against the real API (sandbox mode, no credits spent). **Not yet verified**: the webhook delivery leg, since Copyleaks calls back to a publicly-reachable URL and local dev isn't reachable from the internet. To fully verify end-to-end: either (a) deploy to a real environment with a public `API_URL` and submit a real test manuscript, or (b) tunnel local dev (ngrok/Cloudflare Tunnel) temporarily and set `API_URL` to the tunnel URL before submitting. Set `COPYLEAKS_SANDBOX=true` for that first test — synthetic results, no real credits or actual similarity detection, still exercises the full webhook round-trip.

Scope note: `similarityReport` carries a numeric score + matched-source titles, not a shareable report URL — Copyleaks' completion webhook doesn't include one; generating a downloadable/viewable report is a separate async "export" API call. Skipped for v1 since the score + matches already give an editor enough to act on; revisit if a linkable report becomes a real need.

## 3. Archival & indexing memberships (weeks of lead time — start early)
| Target | Action | Env var |
|---|---|---|
| DOAJ | doaj.org/apply (journal must meet OA/licensing criteria) | `DOAJ_API_KEY` |
| Portico | Preservation agreement at portico.org | `PORTICO_FTP_HOST` (+ creds) |
| CLOCKSS | Membership at clockss.org | `CLOCKSS_ENDPOINT` |

Per-target adapters activate/finish once each credential is handed over.

## 4. Production registration credentials (integrations already built)
1. **Crossref**: membership → `CROSSREF_LOGIN_ID/PASSWORD` secrets; per-tenant `doiPrefix`; disable `CROSSREF_TEST_MODE` in prod.
2. **PubMed Central**: PMC participation agreement → `PMC_FTP_HOST/USERNAME/PASSWORD/PATH`.
3. **Lulu POD**: developers.lulu.com → `LULU_CLIENT_KEY/SECRET`, choose `LULU_POD_PACKAGE_ID`.
4. **Stripe**: live `STRIPE_SECRET_KEY`, live webhook → `STRIPE_WEBHOOK_SECRET`, live Prices → `STRIPE_PRICE_PROFESSIONAL/ENTERPRISE`.
5. **Production SMTP**: replace Mailpit values (`SMTP_HOST/PORT/FROM`) with SES/Postmark/Mailgun — until then no real notifications are delivered.

## 5. Go-live deployment
1. Provision k8s + managed Postgres/Redis + S3-compatible storage.
2. Commit real hostnames/endpoints in `infra/helm/values.yaml`.
3. Repo **Secrets**: `KUBECONFIG` (presence enables the deploy job) + all `PROD_*` secrets referenced in `.github/workflows/ci.yml`.
4. Repo **Variables** (public, baked into browser bundle): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_KEYCLOAK_URL`, `NEXT_PUBLIC_KEYCLOAK_REALM`, `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID`.
5. Push to master → Helm deploy + rollout checks run automatically.

## 6. Editorial setup (in-app, per journal)
1. Create **StyleProfiles** (manual + house rules) and mark publication defaults — the copyedit bot uses them automatically.
2. Collect publisher layouts, **export InDesign → IDML**, upload for porting; designer finishes the scaffold once per journal; mark default.
3. Reviewer accounts need `affiliation` filled (COI filter) and role `PEER_REVIEWER`.
4. Working practice: AI outputs are drafts — review alt-text (`needsReview`), promo posts, and decision letters before use.

## 7. Decisions that unblock the last deferred work
1. ~~APC invoicing model~~ — done (2026-08-06). Chose Stripe Invoices on acceptance. On the ACCEPT decision, `apcProcessor` (`apps/worker/src/processors/apc.ts`) finds-or-creates a Stripe Customer for the author and sends a Stripe Invoice (`collection_method: send_invoice` — an emailed payment link, no card-on-file needed) for the publication's configured APC amount. Set the amount per publication in-app: Publications → [journal] → Author Guidelines tab → Article Processing Charge (empty = no APC, skips cleanly). Payment status (`paid`/`payment_failed`/`void`/`uncollectible`) mirrors onto `Submission.apcReport` via new `invoice.*` cases in the existing Stripe webhook handler, shown on the submission detail page. **No separate dunning bot was needed** — Stripe's own invoice reminders (Settings → Billing → Invoicing in the Stripe Dashboard) already cover that; turn them on there once you're live. **Not yet live-verified**: `STRIPE_SECRET_KEY` is still the `sk_test_CHANGE_ME` placeholder (see item 4.4) — code is thoroughly unit-tested against a mocked Stripe SDK (9 new tests: processor logic, webhook mirroring, dispatch wiring) but hasn't hit the real Stripe API yet. Once you drop in a real test-mode key, accept a test submission and confirm the invoice actually arrives.
2. ~~Compliance bots~~ — done (2026-07-21): ethics/funding/COI plausibility, data-availability link validation, license/copyright completeness gate, all auto-run on SUBMITTED. See `docs/bots-architecture.md`.
3. **Social auto-posting** — currently drafts-only by design; requires platform API credentials + explicit approval.

## Known untested paths (need services/creds not present in dev)
DOCX text extraction via the pandoc container; AI-live behavior (all AI tests use stubs); Scribus composition end-to-end; live similarity/archival providers.
