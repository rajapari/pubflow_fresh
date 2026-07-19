# PubFlow Stage-Bot Architecture

**Status:** Living specification · Last updated 2026-07-15
**Scope:** Automated "bots" (queue workers + AI assistants) supporting every stage of the publishing pipeline, from submission intake to post-publication marketing.

Legend used throughout:

| Mark | Meaning |
|---|---|
| ✅ | Implemented and wired into the codebase |
| 🔜 | Specified here, not yet built |
| 🤖 | LLM-powered (uses the shared AI client) |

---

## 1. Goals & Principles

1. **One bot per stage responsibility.** Each bot does a single, well-defined job for one workflow stage and reports its result into the database, never silently.
2. **Humans decide; bots prepare.** Bots produce reports, suggestions, scaffolds, and classifications. Editorial decisions, copyedit acceptance, and proof approval always remain human actions. AI suggestions are never auto-applied to content.
3. **Graceful degradation.** Every AI-powered path checks `aiEnabled()` and falls back to deterministic behavior when no API key is configured. A bot failing to enqueue must never block an editorial transition (`bot-dispatch.ts` swallows and logs).
4. **Data-driven extensibility.** Adding a new style manual, layout template, or notification is a data/config change, not an engine change.
5. **Everything auditable.** Bots write `WorkflowLog` entries with `performedBy: 'SYSTEM'` and structured metadata; large reports are archived to MinIO.

---

## 2. System Architecture

```
                 ┌────────────────────────────────────────────────┐
                 │                 apps/web (Next.js)             │
                 │  dashboards · proof workbench · style profiles │
                 └───────────────────────┬────────────────────────┘
                                         │ tRPC
                 ┌───────────────────────▼────────────────────────┐
                 │               apps/api (Fastify)               │
                 │  routers/*  ·  lib/bot-dispatch.ts (orchestr.) │
                 └──────┬──────────────────────────────┬──────────┘
                        │ Prisma                       │ BullMQ enqueue
                 ┌──────▼──────┐                ┌──────▼──────────────────┐
                 │  PostgreSQL │                │        Redis            │
                 └─────────────┘                │  queues: pandoc, latex, │
                                                │  scribus, preflight,   │
                                                │  image, notif,          │
                                                │  scheduler, intake,     │
                                                │  copyedit, template,    │
                                                │  correction, revision   │
                                                └──────┬──────────────────┘
                                                       │ BullMQ consume
                 ┌─────────────────────────────────────▼──────────┐
                 │              apps/worker (Node)                │
                 │  processors/* · lib/ai.ts · lib/style-manuals  │
                 │  lib/template-gen.ts · lib/storage.ts          │
                 └──┬──────────┬──────────┬──────────┬─────┬──────┘
                    │          │          │          │     │
              ┌─────▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼───┐ ┌▼───────────────┐
              │ Pandoc  │ │ LaTeX   │ │Scribus │ │Preflt.│ │ IDML extractor │  + LanguageTool,
              │ :4000   │ │ :5001   │ │ :5000  │ │ :4200 │ │ :4100          │    MinIO, Anthropic API
              └─────────┘ └─────────┘ └────────┘ └───────┘ └────────────────┘
```

All five typesetting/pre-press services (`pandoc`, `latex`, `scribus`,
`preflight`, plus `idml` under `--profile tools`) are Dockerfiles under
`services/` and are now actually wired into `infra/docker/docker-compose.yml`
— until 2026-07-09 the first four existed as buildable services referenced by
worker env vars but were **never added to docker-compose.yml**, so a fresh
`pnpm docker:dev` could never actually run the typesetting pipeline. Fixed
alongside the Preflight Bot build (§6). `services/scribus/Dockerfile.headless`
also had a stale `COPY templates/ ./templates/` line referencing a directory
that never existed in the repo — removed (nothing in `server.py` or
`scripts/layout.py` reads from it; the template arrives in the request body).

### 2.1 Queues ✅

Defined in `packages/types/src/jobs.ts` (`QUEUES` const). The API's bull plugin (`apps/api/src/plugins/bull.ts`) creates a producer `Queue` for **every** entry automatically; the worker (`apps/worker/src/worker.ts`) registers one `Worker` per queue.

| Queue | Processor | Concurrency | Purpose |
|---|---|---|---|
| `pandoc` | `pandoc.ts` | 5 | Format conversion (DOCX/LaTeX/MD/ODT → PDF/EPUB/HTML/JATS/…) |
| `latex` | `latex.ts` | 2 | XeLaTeX/LuaLaTeX PDF composition (supports ported `.cls` templates) |
| `scribus` | `scribus.ts` | 2 | PDF/X-4 page layout from `.sla` templates |
| `image` | `image.ts` | 8 | DPI/color-mode validation, ICC, thumbnails, web optimization |
| `notification` | `notification.ts` | 10 | Templated email via SMTP/Mailpit |
| `scheduler` | `scheduler.ts` | 1 | Cron jobs (review reminders, future dunning/alerts) |
| `intake` ✅ | `intake.ts` | 3 | Submission file classification & separation |
| `copyedit` ✅ | `copyedit.ts` | 2 | Style-manual analysis (LanguageTool + AI) |
| `template` ✅ | `template.ts` | 2 | Publisher layout porting (IDML → Scribus/LaTeX) |
| `correction` ✅ | `correction.ts` | 2 | Applies ACCEPTED proof corrections to the DOCX manuscript as a new version |
| `revision` ✅ | `revision.ts` | 2 | Paragraph-level LCS diff between manuscript versions on author resubmission |
| `preflight` ✅ | `preflight.ts` | 3 | PDF/X pre-press gate on PDF_PRINT outputs (fonts, trim/bleed, OutputIntent, print permission) — blocks PROOF_REVIEW on `fail` |

The `intake` queue carries two job kinds: `INTAKE` (file classification) and `COMPLETENESS` (format & completeness checks) — the processor routes on `data.type`.

**Adding a queue** = add to `QUEUES` + a Zod job schema in `jobs.ts`, a processor in `apps/worker/src/processors/`, and one `new Worker(...)` line in `worker.ts`. The API side needs nothing.

### 2.2 Shared AI client ✅ (`apps/worker/src/lib/ai.ts`)

- Direct `fetch` to the Anthropic Messages API — **no SDK dependency**.
- `aiEnabled()` → boolean gate; `aiText(prompt, opts)` → free text; `aiJSON<T>(prompt, opts)` → fence-stripped, validated JSON; `opts.images[]` → base64 vision inputs.
- Env vars: `ANTHROPIC_API_KEY` (required to enable), `ANTHROPIC_MODEL` (default `claude-sonnet-5`), `ANTHROPIC_BASE_URL`, `ANTHROPIC_VERSION`, `ANTHROPIC_TIMEOUT_MS` (default 60 000).
- Every AI-powered bot must catch AI errors and continue with the deterministic result.

### 2.3 Orchestrator ✅ (`apps/api/src/lib/bot-dispatch.ts`)

Central stage-bot dispatch, called from routers after a status transition commits:

- `dispatchStageBots(prisma, queues, submissionId, toStatus)` — switch on target status:
  - `SUBMITTED` → completeness check (always) + intake classification of uploaded assets
  - `REVISED` → revision diff (reviewed version vs author's revised version)
  - `COPY_EDITING` → notify all active tenant `COPY_EDITOR`s a manuscript awaits assignment
  - `ARTWORK_PROCESSING` → Image QA jobs (DPI ≥300, color mode, metadata, thumbnail) for every FIGURE / GRAPHICAL_ABSTRACT / COVER asset + notify `ARTWORK_EDITOR`s
  - `TYPESETTING` → notify `TYPESETTER`s (composition remains a human action via `typesetting.triggerJob`)
  - `PROOF_REVIEW` → `PROOF_READY` notifications to the author plus `PROOF_READER`s and `EDITOR_IN_CHIEF`s
- `dispatchCopyEditStyleBot(...)` — fired by `copyEdit.assign`; resolves the default `StyleProfile` (publication-specific beats tenant-wide) and enqueues the style bot.
- **Contract:** dispatch is best-effort; all errors are caught and logged, never thrown, so workflow transitions cannot be blocked by bot infrastructure.

Hooked call sites: `submission.submit`, `submission.advanceStatus`, `copyEdit.assign`. Any new transition-performing mutation **must** call `dispatchStageBots`.

### 2.4 Workflow state machine (unchanged, authoritative)

`packages/types/src/submission.ts` — `SubmissionStatus` + `VALID_TRANSITIONS` + `isValidTransition()`. Bots key off transitions *into* a status. The production chain:

```
ACCEPTED → COPY_EDITING → ARTWORK_PROCESSING → TYPESETTING → PROOF_REVIEW ⇄ TYPESETTING
                                                                 │
                                                             APPROVED → PUBLISHED
```

---

## 3. Data Model (Prisma)

Added by migrations `20260705000000_add_stage_bots` and `20260705000001_copyedit_style_bot`:

| Addition | Purpose |
|---|---|
| `AssetType.GRAPHICAL_ABSTRACT` ✅ | First-class asset type; exactly one per submission (bot-enforced) |
| `StyleProfile` ✅ | Pluggable copyedit profile: `manual` (enum of 9), `cslStyle`, `rulesetKey`, `promptKey`, `houseRules[]`, `isDefault`, scoped to tenant and optionally one publication |
| `StyleManual` enum ✅ | `INHOUSE, APA7, CHICAGO17, AMA11, MLA9, VANCOUVER, IEEE, CSE, HARVARD` |
| `CopyEdit.styleManual`, `CopyEdit.botReport` ✅ | Which manual the bot ran; full JSON report for the dashboard |
| `LayoutTemplate` ✅ | Ported publisher layout: `sourceFormat` (IDML/INDD/LATEX/PDF), `targetEngine` (SCRIBUS/LATEX), `sourceMinioKey`, `generatedMinioKey`, extracted `spec` JSON, `status` (DRAFT/PROCESSING/READY/FAILED), `isDefault` per publication/tenant |
| `ProofQuery` ✅ | Numbered production query (`label` Q1, Q2…) with optional page + normalized pin position (`posX/posY` ∈ [0,1]); `status` OPEN → ANSWERED → RESOLVED |
| `ProofCorrection` ✅ | Structured correction: `kind` (INSERT/DELETE/REPLACE/MOVE/QUERY_ANSWER/COMMENT), `targetText`/`newText`, `status` OPEN → ACCEPTED/REJECTED → APPLIED |

Asset linkage rule ✅: intake writes `metadata.linkedToDeliverable = true` on SUPPLEMENTARY and GRAPHICAL_ABSTRACT assets. Publish-time consumers (portal, issue assembler, social bot) select assets by this flag + `assetType`.

---

## 4. Stage-by-Stage Bot Catalog

### Stage 1 — Submission / Intake

| Bot | Status | How it works |
|---|---|---|
| **Manuscript Normalizer** | ✅ | `submission.ts` fires `PANDOC:normalize-manuscript` on upload |
| **File Classifier / Separator** | ✅ 🤖 | `processors/intake.ts`. Deterministic filename/MIME heuristics classify every file (manuscript / FIGURE / TABLE / SUPPLEMENTARY / GRAPHICAL_ABSTRACT / COVER) with confidence + reason. If no filename identifies a graphical abstract, AI vision reviews up to 6 figure candidates (≤5 MB each) and nominates one or none. Exactly one GA enforced (highest confidence wins; others demoted). Re-classifies existing `Asset` rows via `assetId` or creates new ones. Triggers: auto on `SUBMITTED` (orchestrator) or manual `asset.classifyIntake` mutation. |
| **Format & Completeness Checker** | ✅ | `processors/completeness.ts` (`COMPLETENESS` job on the `intake` queue, auto on SUBMITTED). Deterministic checks: title/abstract/keywords/co-author emails, manuscript present, DOCX package integrity, body word count, references-section heading, figure mentions in text vs uploaded figure assets. Each check is pass/warn/fail; the structured report lands in a SYSTEM `WorkflowLog` (`metadata.checks`), and the author gets a `COMPLETENESS_REPORT` email **only when something failed**. No AI, works on every deployment. |
| **Plagiarism / Similarity Bot** | ✅(adapter) | SIMILARITY job (auto on SUBMITTED) with a provider seam (`COPYLEAKS_API_KEY`); records exactly why it did not run when unconfigured → `Submission.similarityReport`. Live provider integration lands with real credentials. |
| **AI Screening / Desk-Reject Triage** | ✅ 🤖 | `editorialProcessor` SCREENING job (auto on SUBMITTED): scope-fit vs publication aims, quality/integrity flags → `Submission.screeningReport`; advisory recommendation only, 'skipped' without an AI key. |
| **Metadata Extraction Bot** | 🔜 🤖 | GROBID service + AI cleanup → title/authors/affiliations/ORCID/funding pre-fill. |
| **Reference Validator** | 🔜 | Extend `lib/crossref.ts`: resolve each reference to a DOI, flag unresolvable + retracted (Retraction Watch data). |

### Stage 2 — Peer Review

| Bot | Status | Notes |
|---|---|---|
| **Review Reminder Bot** | ✅ | `processors/scheduler.ts`, daily 08:00 UTC cron; reminds ≤3 days before due, marks OVERDUE, ≥6-day re-remind gap |
| **Reviewer Matcher** | ✅ 🤖 | `editorial.suggestReviewers`: hard deterministic COI exclusions (author/co-author/same-affiliation/already-assigned, never AI-overridable) → deterministic ranking (keyword overlap with review history, then lighter load, then experience) → optional AI re-rank with per-candidate rationale. |
| **Review Quality Bot** | 🔜 🤖 | Score submitted reviews for completeness/constructiveness/tone before editor sees them. |
| **Anonymizer Bot** | 🔜 | Strip author metadata + title-page identifiers from DOCX/PDF for double-blind review. |

### Stage 3 — Author Revision

**Revision-round governance ✅** — `Submission.revisionRound` counts completed
author↔reviewer rounds. Each MINOR/MAJOR_REVISION decision increments it and
**snapshots the reviewed manuscript as a new immutable version** (the author's
edits land on a fresh copy with its own editor cache key). Hard cap **3
rounds**: `makeDecision` rejects a fourth revision decision — the editor must
accept or reject. The round is shown in the editor UI and in every decision's
workflow-log entry.

| Bot | Status | Notes |
|---|---|---|
| **Revision Diff Bot** | ✅ | `processors/revision.ts` on the `revision` queue, auto on → REVISED. Extracts paragraphs from both DOCX versions (shared `lib/docx.ts`), computes an exact paragraph-level LCS diff (adjacent remove+add pairs merged into "modified"; graceful word-count-only fallback above ~4M cell pairs), uploads the full JSON report to MinIO (`revision-diffs/{submissionId}/v{a}-v{b}.json`) and writes a SYSTEM `WorkflowLog` summary: `+X/−Y words, A added / R removed / M modified paragraph(s)`. Non-DOCX version pairs are skipped with a log. |
| **Rebuttal Coverage Checker** | ✅ 🤖 | REBUTTAL job (auto on REVISED, after the revision-diff bot): maps each reviewer point to the paragraph diff, judges yes/partly/no with evidence → `Submission.rebuttalReport`. |

### Stage 4 — Approval / Editorial Decision

| Bot | Status | Notes |
|---|---|---|
| **Workflow-Transition Enforcement** | ✅ | `VALID_TRANSITIONS` enforced in every mutation; `advanceStatus` is the generic editor-driven transition |
| **Decision Letter Generator** | ✅ 🤖 | `editorial.draftDecisionLetter`: AI synthesis of the round's reviews into a numbered decision letter, deterministic sendable template as fallback; drafts only, never sends. |

### Stage 5 — Copyediting

| Bot | Status | How it works |
|---|---|---|
| **Style-Manual Engine** | ✅ 🤖 | `processors/copyedit.ts` + `lib/style-manuals.ts`. Three layers per manual: **(1) CSL** citation style key (consumed by Pandoc/citeproc), **(2) LanguageTool** language variant + enabled/disabled rule ids (40 k-char chunking, offsets re-based), **(3) AI guidance** — manual-specific mechanics prompt; in-house `houseRules[]` overlay OVERRIDES the manual on conflict. Pipeline: extract text (Pandoc → markdown, or raw for MD/LaTeX) → LT pass → AI pass (≤60 k chars, ≤60 suggested edits, `required|recommended` severity) → JSON report to `CopyEdit.botReport` + MinIO archive (`copyedit-reports/{submissionId}/{copyEditId}.json`) + `WorkflowLog`. Suggestions are review-only. |
| **Profile resolution** | ✅ | Job `styleProfileId` > inline `styleManual` > publication default profile > tenant default > INHOUSE. Auto-run on copyeditor assignment; manual re-run via `copyEdit.runStyleBot`. |
| **Grammar Check (interactive)** | ✅ | `grammar.check` tRPC → LanguageTool `:8082` (pre-existing) |
| **Reference Styler** | 🔜 | Re-render reference list in the profile's CSL via Pandoc citeproc; needs `.bib`/CSL-JSON extraction first. |
| **Adding a manual** | ✅ (procedure) | Add enum value (Prisma + Zod) + one entry in `STYLE_MANUALS` (label, cslStyle, lt config, aiGuidance). No engine changes. |

Supported manuals ✅: APA 7, Chicago 17, AMA 11, MLA 9, Vancouver/ICMJE, IEEE, CSE, Harvard (en-GB), In-house.

### Stage 6 — Author Review of Copyedits

| Bot | Status | Notes |
|---|---|---|
| **Author Query Bot** | 🔜 | Reuses `ProofQuery` model pattern at the copyedit stage; scheduler chases unanswered queries. |

### Stage 7 — Artwork Processing

| Bot | Status | Notes |
|---|---|---|
| **Image QA Bot** | ✅ | `processors/image.ts` + `services/image` (Flask + Pillow, no ImageMagick/color-managed ICC transform — reports DPI/color-mode/embedded-ICC-name from the original, `VALIDATE_*` comparison against job targets happens worker-side). Tasks: `EXTRACT_METADATA`/`VALIDATE_DPI`/`VALIDATE_COLORMODE` (read-only), `GENERATE_THUMBNAIL` (max 400px, aspect preserved), `OPTIMIZE_WEB` (JPEG q82 if opaque, else PNG), `CONVERT_FORMAT` (fixed PNG default — job schema has no target-format field), `APPLY_ICC` (reports embedded profile only, not a real color-managed conversion — flagged in the response `errors[]` so this isn't mistaken for one). Auto-dispatched on `ARTWORK_PROCESSING` for every FIGURE/GRAPHICAL_ABSTRACT/COVER asset. |
| **Alt-Text Generator** | 🔜 🤖 | Vision pass over approved figures → `Asset.altText` draft (accessibility + JATS `<alt-text>`); graphical abstract prioritized. |
| **Vector Converter** | 🔜 | EPS/SVG → PDF/press-ready via penpot-exporter or Inkscape service. |
| **Figure Permissions Checker** | 🔜 | Metadata/rules pass flagging third-party figures needing clearance. |

### Stage 8 — Typesetting

| Bot | Status | How it works |
|---|---|---|
| **LaTeX / Scribus / Pandoc composition** | ✅ | Existing processors; `typesetting.triggerJob` routes by engine |
| **Template Porting Bot** | ✅ | `processors/template.ts` + `services/idml` + `lib/template-gen.ts`. **IDML path:** IDML (zip of XML) → Python extractor (`POST /extract`, port 4100, lxml) returns neutral spec: page W×H, margins, bleed, columns+gutter, fonts, named colors (CMYK/RGB), paragraph/character styles (font, size, leading, alignment, spacing, indents) — with safe defaults (A4, 20 mm) so generators never see nulls. Generator emits **Scribus `.sla`** (document geometry, master page, color + STYLE defs, main text frame with columns) or **LaTeX `.cls`** (geometry, xcolor definitions, fontspec main font, per-style `\styleXxx{}` macros, multicol setup). **LaTeX path:** publisher `.cls`/`.tex` stored as-is + geometry sniffed into `spec`. **INDD/PDF:** fail fast with actionable guidance (export IDML / request source). Output → `LayoutTemplate.generatedMinioKey`, status READY. ~80% fidelity target; designer finalizes once per journal. |
| **Template consumption** | ✅ | `triggerJob` accepts `templateId` (or resolves publication/tenant default): LATEX → `.cls` shipped as compile `resource`, `documentClass` = normalized template name (must equal generator's `\ProvidesClass`); SCRIBUS → `templateMinioKey` + `contentMinioKey` (template mandatory for Scribus). |
| **Preflight Bot** | ✅ | `processors/preflight.ts` + `services/preflight` (Flask + pikepdf, no JVM — deliberately lighter than a full ISO 15930 PDF/X validator like veraPDF; see the service docstring for the scope tradeoff). Auto-dispatched by `latex.ts`/`scribus.ts` whenever a job completes successfully **and** the `Output.format` is `PDF_PRINT`. Checks: embedded fonts (Base-14 exempt, subset-tag-aware, Type0/composite descendant-font aware), TrimBox presence (warn if absent) + BleedBox-encloses-TrimBox sanity (fail if not), PDF/X `OutputIntent` presence (warn if absent — presence only, not full conformance), print-permission on encrypted PDFs. Worst case across all pages wins; a corrupt/unopenable PDF fails fast on the integrity check alone. Report → `Output.preflightReport` (`{status: pending\|error\|pass\|warn\|fail, checks[], error?, ranAt}`). **Gate:** `submission.advanceStatus` refuses TYPESETTING → PROOF_REVIEW when the most recent COMPLETED PDF_PRINT output's report is missing/pending, `fail`, or `error`; `pass`/`warn` proceed; no PDF_PRINT output at all is not itself a block (publications that only ever produce PDF_WEB/EPUB aren't penalized). |
| **Pagination QA Bot** | 🔜 | Parse LaTeX logs / Scribus output for overfull boxes, widows/orphans, overset text. |

### Stage 9 — Proof Review (author + editor) ✅

**Online Proof Workbench** — `apps/web/app/dashboard/submissions/[id]/proof/[reviewId]/page.tsx`, linked from the proof-review dashboard.

- **Viewer:** typeset PDF via presigned MinIO URL in an iframe (browser-native rendering, zero deps). Upgrade path: pdf.js canvas + click-to-pin using the already-stored `posX/posY` normalized coordinates.
- **Queries:** production staff (`EDITOR_IN_CHIEF, SECTION_EDITOR, COPY_EDITOR, TYPESETTER, PROOF_READER`) raise auto-labelled queries (Q1, Q2…); author or editor answers inline; staff mark RESOLVED.
- **Corrections:** author/reviewer/editor mark structured corrections (kind, page, exact target text, replacement, note). Editors accept/reject; owner may delete while OPEN; everything locks once the proof review is SUBMITTED. REPLACE/DELETE require `targetText`; REPLACE/INSERT require `newText` (validated server-side).
- **API:** `proofReview.workbench` (single aggregate query incl. presigned PDF URL + role flags), `addQuery`, `answerQuery`, `resolveQuery`, `addCorrection`, `setCorrectionStatus`, `deleteCorrection` — all tenant-scoped with role checks.
- Existing round logic unchanged: all reviews submitted → APPROVED, any rejection → REVISION_REQUIRED.

### Stage 10 — Correction Review / Application

| Bot | Status | How it works |
|---|---|---|
| **Correction Applier Bot** | ✅ | `processors/correction.ts` on the `correction` queue, triggered by `proofReview.applyCorrections` (editor/typesetter; submission must be in PROOF_REVIEW or TYPESETTING). Consumes ACCEPTED `ProofCorrection` rows: REPLACE/DELETE targets are matched against the **concatenated visible text of the DOCX** (dependency-free ZIP reader/writer + `<w:t>` node mapping), so targets split across formatting runs are still found. A target must occur **exactly once** — ambiguous or missing targets are annotated on the correction (`[bot] …`) and left ACCEPTED for manual application; the bot never guesses. INSERT/MOVE/COMMENT/QUERY_ANSWER are positional → always manual. Applied changes produce a **new numbered manuscript version** (proofed version stays immutable), corrections flip to APPLIED, and a SYSTEM `WorkflowLog` records `{applied[], manual[]}`. Non-DOCX manuscripts route everything to manual. |

### Stage 11 — XML & EPUB Generation

| Bot | Status | Notes |
|---|---|---|
| **JATS / EPUB / HTML generation** | ✅ | Pandoc processor (`jats`, `epub3`, `html5` targets) |
| **XML/EPUB Validator Bot** | ✅ | `services/xmlvalidate` (:4300): JATS structural checks via lxml (front matter, title, contributors, graphic hrefs), EPUB via bundled epubcheck (degrades to warn without Java). `xmlvalidateProcessor` writes `Output.validationReport` (preflightReport shape); auto-chained by the pandoc processor after JATS/EPUB generation. |

### Stage 12 — Issue Compiling

| Bot | Status | Notes |
|---|---|---|
| **Issue router** | ✅ | Assign articles to issues, publish notifications |
| **Issue Assembler Bot** | ✅ | `issueProcessor`: reading order via `Submission.issueOrder` (NULLs last, title tiebreak), ToC typeset by the LaTeX service with correct start pages, concatenation via the preflight service's new `/merge` (pikepdf). Result on `Issue.compiledPdfKey`; articles lacking the requested PDF flavor are skipped and reported in `compileError`. API: `issue.setArticleOrder` / `issue.assemble` / `issue.getCompiledPdf`. |

### Stage 13 — Upload & Publish

| Bot | Status | Notes |
|---|---|---|
| **DOI Registration** | ✅ | `lib/crossref.ts` |
| **PubMed Deposit** | ✅ | `lib/pubmed.ts` (FTP) |
| **OAI-PMH / RSS / Portal** | ✅ | `routes/oai.ts`, `routes/rss.ts`, portal router. Portal must render deliverable-linked assets: supplementary files as separate downloads, graphical abstract on the landing page. |
| **DOAJ / Archival (LOCKSS/Portico)** | 🔜 | Deposit adapters on a future `publish` queue. |

### Stage 14 — POD

| Bot | Status | Notes |
|---|---|---|
| **Lulu POD** | ✅ | `lib/printod.ts` |
| **Cover/Spine Bot** | 🔜 | Compute spine width from page count + paper weight; generate print-cover PDF from template. |

### Stage 15 — Billing

| Bot | Status | Notes |
|---|---|---|
| **Billing router / Stripe** | ✅ | Existing |
| **APC Invoice Bot** | 🔜 | Auto-invoice on ACCEPTED; waiver rules per tenant. |
| **Dunning Bot** | 🔜 | Scheduler-pattern payment reminders. |

### Stage 16 — Marketing & Social

| Bot | Status | Notes |
|---|---|---|
| **Lay-Summary / Press Bot** | 🔜 🤖 | Plain-language summary + press draft from title/abstract on PUBLISHED. |
| **Social Post Bot** | 🔜 🤖 | Platform-sized post drafts (X/LinkedIn/Mastodon/Bluesky) + graphical abstract as media; human approves; platform APIs post. |
| **Newsletter/Alert Bot** | 🔜 | Digest of newly published articles to subscribers (notification queue + RSS). |
| **SEO/Scholar Meta** | 🔜 | Highwire/Dublin Core/schema.org tags on portal article pages. |

### Additional stages (not in the original list)

| Bot | Status | Notes |
|---|---|---|
| **Ethics & Compliance Bot** 🤖 | 🔜 | Ethics statements, trial registration, COI/funding disclosure checks at intake. |
| **Data & Code Availability Bot** | 🔜 | Validate repository links/DOIs (Zenodo/Dryad/OSF). |
| **AI-Content & Image-Integrity Bot** 🤖 | 🔜 | AI-text likelihood + figure-manipulation forensics; report-only. |
| **License/Copyright Bot** | 🔜 | CC license selection, author agreement collection/tracking. |
| **Post-Publication Bots** | 🔜 | Errata/retraction workflow, Crossmark updates, altmetrics tracking. |
| **Accessibility Bot** | 🔜 | WCAG/PDF-UA checks on final outputs; consumes Alt-Text bot results. |

---

## 5. Job Schema Reference ✅ (`packages/types/src/jobs.ts`)

```
IntakeJob        { type:'INTAKE', submissionId, files[{minioKey, filename, mimeType,
                   sizeBytes, uploadedById, assetId?}], useVision=true }
CopyEditJob      { type:'COPYEDIT', submissionId, copyEditId, inputMinioKey,
                   inputFormat: docx|markdown|latex|odt, styleProfileId?,
                   styleManual=INHOUSE, cslStyle='apa', houseRules[], applyAi=true }
TemplatePortJob  { type:'TEMPLATE_PORT', templateId, sourceMinioKey,
                   sourceFormat: idml|indd|latex|pdf, targetEngine: SCRIBUS|LATEX }
LatexJob         { ...existing, templateMinioKey?, templateClassName? }   // ported .cls support
CorrectionApplyJob { type:'CORRECTION_APPLY', submissionId, requestedById }
CompletenessJob    { type:'COMPLETENESS', submissionId }                       // intake queue
RevisionDiffJob    { type:'REVISION_DIFF', submissionId, fromVersion?, toVersion? }
PreflightJob       { type:'PREFLIGHT', submissionId, outputId, inputMinioKey }
ImageJob           { type:'IMAGE', assetId, submissionId, inputMinioKey,
                   tasks[VALIDATE_DPI|VALIDATE_COLORMODE|CONVERT_FORMAT|APPLY_ICC|
                   GENERATE_THUMBNAIL|EXTRACT_METADATA|OPTIMIZE_WEB], targetDpi=300,
                   targetColorMode? }
```

Planned queues for 🔜 bots: `similarity`, `xmlvalidate`, `publish`, `marketing` — same recipe (schema + processor + Worker line).

---

## 6. External Services

| Service | Port | Status | Used by |
|---|---|---|---|
| Pandoc (`services/pandoc`) | 4000 | ✅ | pandoc processor, copyedit text extraction. In docker-compose as `pubflow_pandoc` (core, 2026-07-09) |
| LaTeX (`services/latex`) | 5001 | ✅ | latex processor. Accepts `source` **or** legacy `latex` key, optional `resources{filename:base64}` (ported `.cls`, `.bib`, logos — basename-sanitized), returns `{pdf, logs, errors[], metadata}`. In docker-compose as `pubflow_latex` (core, 2026-07-09); large image (`texlive-lang-all`) |
| Scribus headless (`services/scribus`) | 5000 | ✅ | scribus processor (`.sla` + content JSON → PDF). In docker-compose as `pubflow_scribus` (core, 2026-07-09) |
| **Preflight** (`services/preflight`) | 4200 | ✅ | preflight processor. Flask + pikepdf, gunicorn; in docker-compose as `pubflow_preflight` (core) |
| **Image QA** (`services/image`) | 5002 | ✅ | image processor. Flask + Pillow, gunicorn; in docker-compose as `pubflow_image` (core, 2026-07-15). No ImageMagick/color-managed ICC transform — see Stage 7 for the exact scope line. |
| **IDML extractor** (`services/idml`) | 4100 | ✅ | template processor. Flask+lxml, gunicorn; in docker-compose as `pubflow_idml` (`--profile tools`) |
| LanguageTool | 8082 | ✅ | grammar router, copyedit bot |
| MinIO | 9000 | ✅ | all file storage |
| Anthropic API | — | ✅ | `lib/ai.ts` (all 🤖 bots) |
| GROBID, epubcheck | — | 🔜 | metadata extraction, XML validation |

Worker env vars: `REDIS_URL`, `DATABASE_URL`, `MINIO_*`, `PANDOC_SERVICE_URL`, `LATEX_SERVICE_URL`, `SCRIBUS_SERVICE_URL`, `PREFLIGHT_SERVICE_URL`, `IMAGE_SERVICE_URL`, `IDML_SERVICE_URL`, `LANGUAGETOOL_URL`, `ANTHROPIC_*` (§2.2).

---

## 7. API Surface Added ✅

| Router | Endpoints |
|---|---|
| `asset` | `classifyIntake` (author/editor; queues intake bot over all uploaded assets); `GRAPHICAL_ABSTRACT` accepted in upload/confirm/list enums |
| `copyEdit` | `runStyleBot` (choose profile/manual, toggle AI); auto-dispatch on `assign` |
| `styleProfile` | `list / create / update / delete` — one default per scope enforced transactionally |
| `layoutTemplate` | `list / byId / getUploadUrl / create (queues port) / reprocess / getDownloadUrl / delete` |
| `proofReview` | `workbench / addQuery / answerQuery / resolveQuery / addCorrection / setCorrectionStatus / deleteCorrection` |
| `typesetting` | `triggerJob` gains `templateId`; Scribus jobs now correctly populated (template + content keys) |

All new endpoints are tenant-scoped and role-checked (author vs production staff vs editor), consistent with existing router conventions.

---

## 8. Delivery Roadmap

| Phase | Contents | Status |
|---|---|---|
| **A — Foundations + 4 flagship bots** | Queues, schema, AI client, intake classifier, style-manual engine, template porting, proof workbench, orchestrator | ✅ **Done (2026-07-05)** |
| **B — Close the production loop** | ✅ Correction Applier (Stage 10) · ✅ revision-round governance (max 3, per-round version snapshots) · ✅ stage-transition dispatch for COPY_EDITING/ARTWORK/TYPESETTING/PROOF_REVIEW · ✅ production-role seed users · ✅ Preflight Bot + PROOF_REVIEW gate (2026-07-09) · ✅ XML/EPUB Validator + PUBLISH gate wiring pending · ✅ Issue Assembler (2026-07-19) | ✅ **Done (2026-07-19)** |
| **C — Editorial intelligence** | ✅ Format & Completeness Checker · ✅ Revision Diff Bot · 🔜 similarity check, reviewer matcher, AI screening, rebuttal coverage, decision letters | ⏳ started (2026-07-06) |
| **D — Reach & compliance** | Alt-text, marketing/social/newsletter, SEO meta, DOAJ/archival, APC/dunning, ethics/data-availability/integrity, accessibility | 🔜 |

**Recommended next step:** XML/EPUB Validator (Stage 11) — with Preflight now gating the print path, the JATS/EPUB output path has no equivalent pre-publish validation gate.

### Seeded workflow accounts (demo-journal tenant)

`pnpm db:seed` provisions one account per workflow role:

| Role | Email | Password |
|---|---|---|
| Editor-in-Chief | editor@demo-journal.local | Editor@Demo2025! |
| Author | author@demo-journal.local | Author@Demo2025! |
| Peer Reviewer | reviewer@demo-journal.local | Reviewer@Demo2025! |
| Copy Editor | copyeditor@demo-journal.local | CopyEditor@Demo2025! |
| Artwork Editor | artwork@demo-journal.local | Artwork@Demo2025! |
| Typesetter | typesetter@demo-journal.local | Typesetter@Demo2025! |
| Proofreader | proofreader@demo-journal.local | ProofReader@Demo2025! |
| Super Admin (pubflow-admin tenant) | admin@pubflow.local | Admin@PubFlow2025! |

---

## 9. Testing

Suites live beside the code they verify; all run against the real local stack
(Postgres, Redis, MinIO, LanguageTool) with throwaway per-test tenants:

| Suite | Where | Count | Covers |
|---|---|---|---|
| Foundation | `apps/worker/test/foundation.test.ts` | 20 | Job schemas, queue↔worker registry invariant, state-machine invariants, Zod↔Prisma enum parity, AI client parsing/fallbacks |
| Intake | `apps/worker/test/intake.test.ts` | 32 | Table-driven `classify()` heuristics, single-GA enforcement, DB create/update paths, workflow logging |
| Copyedit | `apps/worker/test/copyedit.test.ts` | 8 | Manual registry, live LT matching + 40k chunk offset re-basing, processor e2e, profile override, failure persistence |
| Templates | `apps/worker/test/template.test.ts` | 13 | SLA well-formedness, geometry/color/style porting, class-name invariant, unit conversion, IDML→SLA e2e via live extractor |
| Proof API | `apps/api/test/proofReview.test.ts` | 15 | Role matrix, label sequencing, correction validation, tenant isolation, submit lock (via `createCaller`) |
| Orchestrator | `apps/api/test/botDispatch.test.ts` | 7 | Real Redis job payloads, no-op paths, never-throw contract, profile-priority dispatch |
| Preflight gate | `apps/api/test/preflightGate.test.ts` | 8 | `advanceStatus` → PROOF_REVIEW: pass/warn allowed, fail/error/pending blocked, absent PDF_PRINT output not blocked, non-COMPLETED output ignored, most-recent-COMPLETED-wins ordering |
| IDML service | `services/idml/test_server.py` | 6 | Synthetic-IDML extraction, defaults, corrupt/wrong-type rejection |
| LaTeX service | `services/latex/test_server.py` | 5 | source/latex key contract, resource placement + traversal guard, response shape, pass clamping |
| Preflight service | `services/preflight/test_server.py` | 15 | Fonts (Base-14 exempt, subset-tag stripping, Type0 descendants), trim/bleed sanity, PDF/X intent, encrypted print-permission, corrupt-PDF fast fail, multi-page worst-case, Flask route contract |
| Image | `apps/worker/test/image.test.ts` | 4 | DB + live image service: full task set on a DPI-less image → NEEDS_REVISION with all Asset fields populated, metadata-only tasks approve regardless of actual DPI, color-mode mismatch flagged against a target, corrupt image rejected not silently accepted |
| Image service | `services/image/test_server.py` | 22 | DPI/dimension/color-mode extraction (RGB/CMYK/grayscale), real-ICC-profile name extraction vs. absent-profile, thumbnail aspect preservation, CMYK→PNG fallback (PNG can't encode CMYK directly), OPTIMIZE_WEB format selection (JPEG opaque / PNG alpha), CONVERT_FORMAT default, corrupt-image rejection, Flask route contract |

Run: `pnpm --filter @pubflow/worker test`, `pnpm --filter @pubflow/api test`,
`python -m pytest services/idml/test_server.py -q`,
`python -m pytest services/latex/test_server.py -q`,
`python -m pytest services/preflight/test_server.py -q`,
`python -m pytest services/image/test_server.py -q`
(idml/latex/preflight/image run as separate invocations — `services/idml/test_server.py`
and `services/latex/test_server.py` share a basename and collide if pytest
collects them together). CI now runs the full worker/api/python suite on every
push (`.github/workflows/ci.yml` `test` job, added 2026-07-09) against live
Postgres/Redis/MinIO/LanguageTool containers — previously only lint/typecheck
ran automatically and ~100 existing tests never executed in CI.

Bugs found and fixed by this pass: `PROOF_READER` missing from auth role
schema/hierarchy; hyphens not treated as filename word separators (GA
detection misses); camelCase GA hint gap; asset uploads blocked before
ACCEPTED (starving intake); LT 30s hard timeout aborting full-size chunks;
IDML CMYK 0–100 emitted into xcolor's 0–1 model (near-black prints);
LaTeX class-name normalization drift between generator and router;
plus a stale May-era Postgres container shadowing port 5432.

Gap-audit fixes (2026-07-06): `USER_INVITED` was sent by `publication.invite`
but missing from the `NotificationJob` template enum — every invite email
failed schema validation in the processor and died silently after retries;
`makeDecision` never called `dispatchStageBots`, so decision transitions
(REVISION_REQUIRED / ACCEPTED / REJECTED) bypassed the orchestrator contract;
the `SUBMITTED` dispatch returned early when a submission had no uploaded
assets, which would have skipped completeness checks for create-in-editor
manuscripts (completeness now enqueues before the asset guard).

## 10. Operational Notes

- **Prisma on Windows dev:** running dev servers lock the query-engine DLL → use `npx prisma generate --no-engine` for client-type updates. Always run `npx prisma` from `packages/db` (repo root resolves a newer Prisma with breaking CLI flags).
- **Migrations:** produced via `prisma migrate diff --from-url <dev db> --to-schema-datamodel`, saved under `prisma/migrations/<ts>_<name>/migration.sql`, applied with `migrate deploy`.
- **Bot failure semantics:** processor throws → BullMQ retries (3 attempts, exponential 5 s backoff) → failure recorded on the owning row (`Output.errorMessage`, `LayoutTemplate.errorMessage`, `CopyEdit.botReport.error`) — never only in logs.
- **Token-cost bounds:** intake vision ≤6 images ≤5 MB each; copyedit AI ≤60 k chars, ≤60 edits, temperature 0.
- **Idempotency:** intake re-classification updates existing assets (`assetId`); cron registration uses fixed `jobId`; report keys are deterministic per copyedit.
- **Error tracking (2026-07-09):** Sentry wired into api/web/worker behind `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (unset = fully inert, zero behavior change — same `aiEnabled()`-style gate pattern as §2.2). Worker reports on exhausted-retry job failures and worker-level errors, not every transient retry.
- **Backup/restore (2026-07-09):** `scripts/backup.sh` / `scripts/restore.sh` — Postgres `pg_dump` + full MinIO bucket mirror, manifest-verified. Restore is dry-run by default, requires explicit `--force`. Full runbook: `docs/backup-restore.md`.
