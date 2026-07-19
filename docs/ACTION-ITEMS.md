# PubFlow — Owner Action Items

**As of 2026-07-19.** Phases A–D of the bot pipeline are built, tested (worker 101 / api 33 / python 42), and green in CI. Everything below is what only the **owner** can do: credentials, memberships, and decisions. Ordered by impact.

## 1. Activate the AI bots (~15 min)
All AI bots (intake vision, AI copyedit, screening, rebuttal coverage, reviewer re-rank, decision letters, alt-text, promo kit) currently write `status: "skipped"` reports.
1. Create a key at console.anthropic.com (set a spend limit).
2. Dev: `ANTHROPIC_API_KEY=...` in root `.env`; restart the worker.
3. Prod: GitHub repo secret `ANTHROPIC_API_KEY` (Helm already injects it).
4. Verify: submit a test manuscript → `Submission.screeningReport.status === "done"`.

## 2. Similarity provider (decision + signup)
- Choose: Crossref Similarity Check / iThenticate (scholarly standard; needs Crossref membership) or Copyleaks (fast REST signup).
- Obtain the API key, then request the live adapter build — the integration is intentionally unwritten until real credentials exist to test against (no untested transmission of author manuscripts to third parties).
- Verify: resubmit → `similarityReport` carries a score + report URL.

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
1. **APC invoicing model** — pick one: (a) Stripe Invoices on acceptance, (b) internal Invoice table with manual tracking, (c) not needed. Unblocks the APC + dunning bots.
2. **Compliance bots** (ethics / data-availability / license collection) — approve to build.
3. **Social auto-posting** — currently drafts-only by design; requires platform API credentials + explicit approval.

## Known untested paths (need services/creds not present in dev)
DOCX text extraction via the pandoc container; AI-live behavior (all AI tests use stubs); Scribus composition end-to-end; live similarity/archival providers.
