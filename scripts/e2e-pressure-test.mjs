#!/usr/bin/env node
// ── End-to-end pressure test ──────────────────────────────
// Drives the live local stack (pnpm dev, http://127.0.0.1:3001) as real
// users via Keycloak ROPC + raw tRPC HTTP calls. Covers the full editorial
// lifecycle, RBAC, validation, and known edge cases. Never throws out of a
// single test — every check is isolated so one failure doesn't stop the run.
// Usage: node scripts/e2e-pressure-test.mjs

const API = 'http://127.0.0.1:3001'
const KC  = 'http://127.0.0.1:8080'
const MAILPIT = 'http://127.0.0.1:8025'
const REALM = 'pubflow'

async function mailCountTo(email) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + email)}`)
  const body = await res.json()
  return body.messages_count ?? 0
}

const ACCOUNTS = {
  editor:     { email: 'editor@demo-journal.local',     password: 'Editor@Demo2025!' },
  author:     { email: 'author@demo-journal.local',     password: 'Author@Demo2025!' },
  author1:    { email: 'author1@pubflow.local',         password: 'password123' },
  reviewer:   { email: 'reviewer@demo-journal.local',   password: 'Reviewer@Demo2025!' },
  copyeditor: { email: 'copyeditor@demo-journal.local', password: 'CopyEditor@Demo2025!' },
  artwork:    { email: 'artwork@demo-journal.local',    password: 'Artwork@Demo2025!' },
  typesetter: { email: 'typesetter@demo-journal.local', password: 'Typesetter@Demo2025!' },
  proofreader:{ email: 'proofreader@demo-journal.local',password: 'ProofReader@Demo2025!' },
  admin:      { email: 'admin@pubflow.local',           password: 'Admin@PubFlow2025!' },
}

const tokenCache = new Map()
async function login(who) {
  if (tokenCache.has(who)) return tokenCache.get(who)
  const { email, password } = ACCOUNTS[who]
  const res = await fetch(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'pubflow-web', username: email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`login(${who}) failed: ${res.status} ${JSON.stringify(data)}`)
  tokenCache.set(who, data.access_token)
  return data.access_token
}

async function loginBad(email, password) {
  const res = await fetch(`${KC}/realms/${REALM}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'pubflow-web', username: email, password }),
  })
  return res.status
}

// ── tRPC HTTP (non-batch) client ──
async function trpc(who, method, path, input) {
  const token = who ? await login(who) : null
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  let res
  if (method === 'query') {
    const qs = input !== undefined ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ''
    res = await fetch(`${API}/trpc/${path}${qs}`, { headers })
  } else {
    res = await fetch(`${API}/trpc/${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    })
  }
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { status: res.status, body }
}
const q = (who, path, input) => trpc(who, 'query', path, input)
const m = (who, path, input) => trpc(who, 'mutation', path, input)

function errCode(resp) {
  return resp.body?.error?.data?.code ?? resp.body?.error?.code ?? null
}
function errMsg(resp) {
  return resp.body?.error?.message ?? ''
}

// ── Results ──
const results = []
function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}
async function test(name, fn) {
  try {
    await fn()
  } catch (err) {
    record(name, false, `threw: ${err?.message ?? err}`)
  }
}
function expect(name, cond, detail) {
  record(name, !!cond, detail)
}

const rnd = () => Math.random().toString(36).slice(2, 10)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('='.repeat(70))
  console.log('PubFlow end-to-end pressure test —', new Date().toISOString())
  console.log('='.repeat(70))

  // ═══ 1. AUTH ═══
  await test('auth: every seeded account logs in', async () => {
    for (const who of Object.keys(ACCOUNTS)) {
      await login(who)
    }
    expect('auth: every seeded account logs in', true)
  })

  await test('auth: wrong password rejected', async () => {
    const status = await loginBad(ACCOUNTS.author.email, 'definitely-wrong-password')
    expect('auth: wrong password rejected (401)', status === 401, `got ${status}`)
  })

  await test('auth: unknown user rejected', async () => {
    const status = await loginBad('nobody-here@pubflow.local', 'whatever')
    expect('auth: unknown user rejected (401)', status === 401, `got ${status}`)
  })

  await test('auth: no token on protected procedure -> UNAUTHORIZED', async () => {
    const r = await trpc(null, 'query', 'submission.list', { page: 1, limit: 1 })
    expect('auth: anonymous call rejected', errCode(r) === 'UNAUTHORIZED', `status=${r.status} code=${errCode(r)}`)
  })

  await test('auth: garbage bearer token rejected', async () => {
    const res = await fetch(`${API}/trpc/submission.list?input=${encodeURIComponent(JSON.stringify({ page: 1, limit: 1 }))}`, {
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    })
    const body = await res.json().catch(() => ({}))
    const code = body?.error?.data?.code ?? body?.error?.code
    expect('auth: garbage token rejected', code === 'UNAUTHORIZED', `status=${res.status} code=${code}`)
  })

  // ═══ 2. RBAC ═══
  await test('rbac: AUTHOR cannot create a publication (chiefEditorProcedure)', async () => {
    const r = await m('author', 'publication.create', { title: 'Hacked Journal ' + rnd(), type: 'JOURNAL' })
    expect('rbac: author blocked from publication.create', errCode(r) === 'FORBIDDEN', `status=${r.status} code=${errCode(r)} msg=${errMsg(r)}`)
  })

  await test('rbac: AUTHOR cannot assign a reviewer (editorProcedure)', async () => {
    const r = await m('author', 'review.assignReviewer', { submissionId: '00000000-0000-0000-0000-000000000000', reviewerId: '00000000-0000-0000-0000-000000000000' })
    expect('rbac: author blocked from review.assignReviewer', errCode(r) === 'FORBIDDEN', `status=${r.status} code=${errCode(r)}`)
  })

  await test('rbac: PEER_REVIEWER cannot call advanceStatus (editorProcedure)', async () => {
    const r = await m('reviewer', 'submission.advanceStatus', { submissionId: '00000000-0000-0000-0000-000000000000', toStatus: 'PEER_REVIEW' })
    expect('rbac: reviewer blocked from advanceStatus', errCode(r) === 'FORBIDDEN', `status=${r.status} code=${errCode(r)}`)
  })

  await test('rbac: SECTION_EDITOR-level editor cannot hit chiefEditorProcedure if below rank', async () => {
    // copyeditor role should not pass editorProcedure (SECTION_EDITOR rank) either
    const r = await m('copyeditor', 'review.assignReviewer', { submissionId: '00000000-0000-0000-0000-000000000000', reviewerId: '00000000-0000-0000-0000-000000000000' })
    expect('rbac: copyeditor blocked from editorProcedure action', errCode(r) === 'FORBIDDEN', `status=${r.status} code=${errCode(r)}`)
  })

  // ═══ 3. VALIDATION (zod) ═══
  await test('validation: title too short (<10 chars) rejected', async () => {
    const pubs = await q('author', 'publication.list')
    const pubId = pubs.body?.result?.data?.[0]?.id
    const r = await m('author', 'submission.create', { publicationId: pubId, title: 'short', abstract: 'x'.repeat(60), keywords: ['a'] })
    expect('validation: short title rejected (BAD_REQUEST)', errCode(r) === 'BAD_REQUEST', `status=${r.status} code=${errCode(r)}`)
  })

  await test('validation: abstract too short (<50 chars) rejected', async () => {
    const pubs = await q('author', 'publication.list')
    const pubId = pubs.body?.result?.data?.[0]?.id
    const r = await m('author', 'submission.create', { publicationId: pubId, title: 'A title that is long enough to pass', abstract: 'too short', keywords: ['a'] })
    expect('validation: short abstract rejected', errCode(r) === 'BAD_REQUEST', `status=${r.status} code=${errCode(r)}`)
  })

  await test('validation: empty keywords array rejected', async () => {
    const pubs = await q('author', 'publication.list')
    const pubId = pubs.body?.result?.data?.[0]?.id
    const r = await m('author', 'submission.create', { publicationId: pubId, title: 'A title that is long enough to pass', abstract: 'x'.repeat(60), keywords: [] })
    expect('validation: empty keywords rejected', errCode(r) === 'BAD_REQUEST', `status=${r.status} code=${errCode(r)}`)
  })

  await test('validation: malformed UUID in path param rejected', async () => {
    const r = await q('author', 'submission.byId', { id: 'not-a-uuid' })
    expect('validation: malformed uuid rejected', errCode(r) === 'BAD_REQUEST', `status=${r.status} code=${errCode(r)}`)
  })

  await test('validation: invalid coAuthor email rejected', async () => {
    const pubs = await q('author', 'publication.list')
    const pubId = pubs.body?.result?.data?.[0]?.id
    const r = await m('author', 'submission.create', {
      publicationId: pubId, title: 'A title that is long enough to pass', abstract: 'x'.repeat(60),
      keywords: ['test'], coAuthors: [{ name: 'Bad Email', email: 'not-an-email' }],
    })
    expect('validation: invalid coAuthor email rejected', errCode(r) === 'BAD_REQUEST', `status=${r.status} code=${errCode(r)}`)
  })

  // ═══ 4. NOT FOUND / CROSS-TENANT ═══
  await test('notfound: random uuid submission -> NOT_FOUND', async () => {
    const r = await q('editor', 'submission.byId', { id: '11111111-1111-1111-1111-111111111111' })
    expect('notfound: random submission id', errCode(r) === 'NOT_FOUND', `status=${r.status} code=${errCode(r)}`)
  })

  await test('tenant isolation: admin@pubflow.local (pubflow-admin tenant) sees its own publication IDs, not demo-journal\'s', async () => {
    const demoPubs = await q('editor', 'publication.list')
    const demoIds = new Set((demoPubs.body?.result?.data ?? []).map((p) => p.id))
    const r = await q('admin', 'publication.list')
    const adminIds = (r.body?.result?.data ?? []).map((p) => p.id)
    // Titles legitimately collide across tenants (every tenant seeds the same
    // default catalog — see packages/db/catalog.mts) — only object IDs prove isolation.
    const leaked = adminIds.some((id) => demoIds.has(id))
    expect('tenant isolation: no shared publication IDs across tenants', !leaked, `adminIds(sample)=${JSON.stringify(adminIds.slice(0, 3))}`)
  })

  // ═══ 5. GOLDEN PATH: full submission lifecycle ═══
  let pubId, submissionId, manuscriptId, reviewId, copyEditId

  await test('setup: editor sets an APC on a publication', async () => {
    const pubs = await q('editor', 'publication.list')
    const target = (pubs.body?.result?.data ?? []).find((p) => p.title === 'Nature Cell Biology') ?? pubs.body?.result?.data?.[0]
    pubId = target.id
    const r = await m('editor', 'publication.update', { id: pubId, apcAmount: 500, apcCurrency: 'usd' })
    expect('setup: APC set to 500 usd', r.body?.result?.data?.apcAmountCents === 50000, `resp=${JSON.stringify(r.body)}`)
  })

  await test('golden path: author creates a DRAFT submission', async () => {
    const r = await m('author', 'submission.create', {
      publicationId: pubId,
      title: `E2E Pressure Test Submission ${rnd()}`,
      abstract: 'This submission exercises the full editorial pipeline end to end as part of an automated pressure test. '.repeat(2),
      keywords: ['pressure-test', 'e2e', 'automation'],
      coAuthors: [{ name: 'Co Author', email: 'coauthor@example.com', affiliation: 'Test University' }],
    })
    submissionId = r.body?.result?.data?.id
    expect('golden path: DRAFT created', r.status === 200 && !!submissionId && r.body.result.data.status === 'DRAFT', JSON.stringify(r.body).slice(0, 300))
  })

  await test('golden path: submit without a manuscript is rejected', async () => {
    const r = await m('author', 'submission.submit', { id: submissionId })
    expect('golden path: submit blocked with no manuscript', errCode(r) === 'BAD_REQUEST', `status=${r.status} code=${errCode(r)} msg=${errMsg(r)}`)
  })

  await test('golden path: author creates a blank manuscript', async () => {
    const r = await m('author', 'submission.createBlankManuscript', { submissionId })
    manuscriptId = r.body?.result?.data?.manuscriptId
    expect('golden path: blank manuscript created', !!manuscriptId, JSON.stringify(r.body).slice(0, 300))
  })

  await test('golden path: author submits -> SUBMITTED', async () => {
    const r = await m('author', 'submission.submit', { id: submissionId })
    expect('golden path: SUBMITTED', r.body?.result?.data?.status === 'SUBMITTED', JSON.stringify(r.body).slice(0, 300))
  })

  await test('golden path: re-submitting an already-SUBMITTED draft is rejected', async () => {
    const r = await m('author', 'submission.submit', { id: submissionId })
    expect('golden path: double-submit rejected', errCode(r) === 'BAD_REQUEST', `status=${r.status} code=${errCode(r)}`)
  })

  await test('golden path: another author cannot see this DRAFT-born submission by id', async () => {
    const r = await q('author1', 'submission.byId', { id: submissionId })
    expect('golden path: cross-author read blocked', errCode(r) === 'FORBIDDEN' || errCode(r) === 'NOT_FOUND', `status=${r.status} code=${errCode(r)}`)
  })

  await sleep(3000) // let SUBMITTED-stage bots (intake/screening/similarity/compliance) run

  await test('bots: stage bots ran on SUBMITTED (workflow log + reports present)', async () => {
    const r = await q('editor', 'submission.byId', { id: submissionId })
    const sub = r.body?.result?.data
    const logCount = sub?.workflowLogs?.length ?? 0
    expect('bots: workflow log recorded for SUBMITTED', logCount >= 1, `logs=${logCount}`)
  })

  await test('golden path: editor advances SUBMITTED -> DESK_REVIEW', async () => {
    const r = await m('editor', 'submission.advanceStatus', { submissionId, toStatus: 'DESK_REVIEW' })
    expect('golden path: DESK_REVIEW', r.body?.result?.data?.status === 'DESK_REVIEW', JSON.stringify(r.body).slice(0, 300))
  })

  await test('golden path: editor assigns reviewer at DESK_REVIEW', async () => {
    // suggestReviewers returns { candidates, excluded, ... } — not a bare array.
    const suggestions = await q('editor', 'editorial.suggestReviewers', { submissionId })
    const candidate = suggestions.body?.result?.data?.candidates?.[0]
    const r = await m('editor', 'review.assignReviewer', { submissionId, reviewerId: candidate?.id })
    reviewId = r.body?.result?.data?.id
    expect('golden path: reviewer invited', r.body?.result?.data?.status === 'INVITED', JSON.stringify(r.body).slice(0, 300) + ' candidate=' + JSON.stringify(candidate))
  })

  await test('golden path: editor advances DESK_REVIEW -> PEER_REVIEW', async () => {
    const r = await m('editor', 'submission.advanceStatus', { submissionId, toStatus: 'PEER_REVIEW' })
    expect('golden path: PEER_REVIEW', r.body?.result?.data?.status === 'PEER_REVIEW', JSON.stringify(r.body).slice(0, 300))
  })

  await test('golden path: reviewer accepts invitation', async () => {
    const r = await m('reviewer', 'review.acceptInvitation', { reviewId })
    expect('golden path: review ACCEPTED', r.body?.result?.data?.status === 'ACCEPTED', JSON.stringify(r.body).slice(0, 300))
  })

  await test('golden path: a different reviewer cannot accept someone else\'s invitation', async () => {
    // Use reviewer themselves again — already ACCEPTED, so re-accept should fail by state, not identity.
    // Real identity check: have author try to accept it (author has no Review row at all for this id -> FORBIDDEN).
    const r = await m('author', 'review.acceptInvitation', { reviewId })
    expect('rbac: non-reviewer blocked from accepting someone else\'s review', errCode(r) === 'FORBIDDEN', `status=${r.status} code=${errCode(r)}`)
  })

  await test('golden path: reviewer starts review', async () => {
    const r = await m('reviewer', 'review.startReview', { reviewId })
    expect('golden path: review IN_PROGRESS', r.body?.result?.data?.status === 'IN_PROGRESS', JSON.stringify(r.body).slice(0, 300))
  })

  await test('golden path: author cannot see reviews while PEER_REVIEW is active', async () => {
    const r = await q('author', 'review.listForSubmission', { submissionId })
    const list = r.body?.result?.data
    expect('golden path: reviews hidden from author during PEER_REVIEW', Array.isArray(list) && list.length === 0, JSON.stringify(list))
  })

  await test('golden path: reviewer submits the review', async () => {
    const r = await m('reviewer', 'review.submit', {
      reviewId, recommendation: 'MINOR_REVISION',
      comments: 'Solid methodology overall; a few clarifications needed in section 2.',
      confidentialNotes: 'Editor-only: author is a known quantity, review straightforward.',
    })
    expect('golden path: review SUBMITTED', r.body?.result?.data?.status === 'SUBMITTED', JSON.stringify(r.body).slice(0, 300))
  })

  await test('golden path: editor makes ACCEPT decision -> ACCEPTED', async () => {
    const r = await m('editor', 'submission.makeDecision', { submissionId, decision: 'ACCEPT', notes: 'Looks great, accepting.' })
    expect('golden path: makeDecision succeeded', r.body?.result?.data?.success === true, JSON.stringify(r.body).slice(0, 300))
    const check = await q('editor', 'submission.byId', { id: submissionId })
    expect('golden path: status is ACCEPTED', check.body?.result?.data?.status === 'ACCEPTED', check.body?.result?.data?.status)
  })

  await test('golden path: confidentialNotes masked from author, visible to editor (once no longer hidden by PEER_REVIEW)', async () => {
    // review.listForSubmission hides the whole list from the author while
    // status === PEER_REVIEW; the masking logic itself only becomes
    // observable once a decision has moved the submission past that status.
    const asAuthor = await q('author', 'review.listForSubmission', { submissionId })
    const asEditor = await q('editor', 'review.listForSubmission', { submissionId })
    const authorRow = asAuthor.body?.result?.data?.find((x) => x.id === reviewId)
    const editorRow = asEditor.body?.result?.data?.find((x) => x.id === reviewId)
    expect('golden path: confidentialNotes masked for author',
      authorRow?.confidentialNotes === null && !!editorRow?.confidentialNotes,
      `author=${JSON.stringify(authorRow?.confidentialNotes)} editor=${editorRow?.confidentialNotes}`)
  })

  await sleep(3000) // let the APC invoice bot run

  await test('apc: invoice fired on ACCEPT when publication has an APC configured', async () => {
    const r = await q('editor', 'submission.byId', { id: submissionId })
    const apc = r.body?.result?.data?.apcReport
    expect('apc: apcReport present after ACCEPT', !!apc, JSON.stringify(apc))
  })

  // ═══ 6. REVISION-ROUND CAP (separate submission) ═══
  let revSubId
  await test('revision cap: setup a second submission for the 3-round test', async () => {
    const r = await m('author', 'submission.create', {
      publicationId: pubId, title: `E2E Revision Cap Test ${rnd()}`,
      abstract: 'Exercises the maximum-3-revision-rounds business rule. '.repeat(3),
      keywords: ['revision-cap'],
    })
    revSubId = r.body?.result?.data?.id
    await m('author', 'submission.createBlankManuscript', { submissionId: revSubId })
    await m('author', 'submission.submit', { id: revSubId })
    await m('editor', 'submission.advanceStatus', { submissionId: revSubId, toStatus: 'DESK_REVIEW' })
    const check = await q('editor', 'submission.byId', { id: revSubId })
    expect('revision cap: setup reached DESK_REVIEW', check.body?.result?.data?.status === 'DESK_REVIEW', check.body?.result?.data?.status)
  })

  for (let round = 1; round <= 3; round++) {
    await test(`revision cap: round ${round} MAJOR_REVISION decision accepted`, async () => {
      const r = await m('editor', 'submission.makeDecision', { submissionId: revSubId, decision: 'MAJOR_REVISION', notes: `round ${round}` })
      expect(`revision cap: round ${round} decision ok`, r.body?.result?.data?.success === true, JSON.stringify(r.body).slice(0, 200))
      // Author resubmits (REVISION_REQUIRED -> REVISED), then the editor moves
      // REVISED -> PEER_REVIEW — the only status from which another
      // REVISION_REQUIRED decision (or the cap check) can be evaluated; VALID_TRANSITIONS
      // does not allow REVISED -> REVISION_REQUIRED directly.
      await m('author', 'submission.submit', { id: revSubId })
      await m('editor', 'submission.advanceStatus', { submissionId: revSubId, toStatus: 'PEER_REVIEW' })
    })
  }

  await test('revision cap: a 4th revision decision is rejected once the cap is hit', async () => {
    const r = await m('editor', 'submission.makeDecision', { submissionId: revSubId, decision: 'MAJOR_REVISION', notes: 'round 4 — should be blocked' })
    expect('revision cap: 4th round blocked by the cap specifically (not just a transition error)',
      errCode(r) === 'BAD_REQUEST' && /maximum allowed/i.test(errMsg(r)), `status=${r.status} code=${errCode(r)} msg=${errMsg(r)}`)
  })

  // ═══ 7. PRODUCTION PIPELINE: copyediting -> artwork -> typesetting -> proof -> approved ═══
  let artworkMailBaseline = 0
  await test('setup: capture artwork-editor mailbox baseline', async () => {
    artworkMailBaseline = await mailCountTo(ACCOUNTS.artwork.email)
    expect('setup: baseline captured', true, `baseline=${artworkMailBaseline}`)
  })

  await test('production: editor assigns a copy editor (ACCEPTED -> COPY_EDITING)', async () => {
    const r = await m('editor', 'copyEdit.assign', { submissionId, editorId: (await getUserId('copyeditor')), notes: 'please tidy citations' })
    copyEditId = r.body?.result?.data?.id
    expect('production: copyEdit created', !!copyEditId, JSON.stringify(r.body).slice(0, 300))
    const check = await q('editor', 'submission.byId', { id: submissionId })
    expect('production: status COPY_EDITING', check.body?.result?.data?.status === 'COPY_EDITING', check.body?.result?.data?.status)
  })

  await test('production: copyeditor starts and submits the copy edit', async () => {
    await m('copyeditor', 'copyEdit.start', { id: copyEditId }).catch(() => {})
    const r = await m('copyeditor', 'copyEdit.submitEdited', { id: copyEditId, minioKey: 'fake/not-real.docx', comments: 'done' })
    expect('production: copyEdit SUBMITTED', r.body?.result?.data?.status === 'SUBMITTED', JSON.stringify(r.body).slice(0, 300))
  })

  await test('production: editor approves copy edit (COPY_EDITING -> ARTWORK_PROCESSING)', async () => {
    const r = await m('editor', 'copyEdit.approve', { id: copyEditId })
    expect('production: copyEdit approve succeeded', r.body?.result?.data?.success === true, JSON.stringify(r.body).slice(0, 300))
    const check = await q('editor', 'submission.byId', { id: submissionId })
    expect('production: status ARTWORK_PROCESSING', check.body?.result?.data?.status === 'ARTWORK_PROCESSING', check.body?.result?.data?.status)
  })

  await test('regression: ARTWORK_PROCESSING stage bots actually dispatch (copyEdit.approve must call dispatchStageBots)', async () => {
    const before = artworkMailBaseline
    let after = before
    for (let i = 0; i < 25 && after <= before; i++) { await sleep(1000); after = await mailCountTo(ACCOUNTS.artwork.email) }
    expect('regression: artwork editor notified on ARTWORK_PROCESSING', after > before, `before=${before} after=${after}`)
  })

  await test('production: editor advances ARTWORK_PROCESSING -> TYPESETTING', async () => {
    const r = await m('editor', 'submission.advanceStatus', { submissionId, toStatus: 'TYPESETTING' })
    expect('production: status TYPESETTING', r.body?.result?.data?.status === 'TYPESETTING', JSON.stringify(r.body).slice(0, 300))
  })

  await test('production: typesetter triggers a PANDOC typesetting job', async () => {
    const r = await m('typesetter', 'typesetting.triggerJob', { submissionId, engine: 'PANDOC', outputFormat: 'PDF_WEB' })
    expect('production: typesetting job queued', r.body?.result?.data?.status === 'QUEUED', JSON.stringify(r.body).slice(0, 300))
  })

  await test('production: editor advances TYPESETTING -> PROOF_REVIEW', async () => {
    const r = await m('editor', 'submission.advanceStatus', { submissionId, toStatus: 'PROOF_REVIEW' })
    expect('production: status PROOF_REVIEW', r.body?.result?.data?.status === 'PROOF_REVIEW', JSON.stringify(r.body).slice(0, 300))
  })

  await test('production: editor advances PROOF_REVIEW -> APPROVED', async () => {
    const r = await m('editor', 'submission.advanceStatus', { submissionId, toStatus: 'APPROVED' })
    expect('production: status APPROVED', r.body?.result?.data?.status === 'APPROVED', JSON.stringify(r.body).slice(0, 300))
  })

  await test('production: APPROVED -> SUBMITTED is an invalid transition (should be rejected)', async () => {
    const r = await m('editor', 'submission.advanceStatus', { submissionId, toStatus: 'SUBMITTED' })
    expect('production: invalid backward transition rejected', errCode(r) === 'BAD_REQUEST', `status=${r.status} code=${errCode(r)}`)
  })

  // ═══ 8. PUBLISH VIA ISSUE (the only real UI path to PUBLISHED) ═══
  let issueId
  await test('publish: editor creates an issue and assigns the APPROVED submission to it', async () => {
    const r = await m('editor', 'issue.create', { publicationId: pubId, volume: 99, number: 1, year: 2026 })
    issueId = r.body?.result?.data?.id
    expect('publish: issue created', !!issueId, JSON.stringify(r.body).slice(0, 300))
    const assign = await m('editor', 'issue.assignSubmission', { issueId, submissionId })
    expect('publish: submission assigned to issue', assign.status === 200, JSON.stringify(assign.body).slice(0, 300))
  })

  await test('publish: chief editor publishes the issue (APPROVED -> PUBLISHED)', async () => {
    const r = await m('editor', 'issue.publish', { id: issueId })
    expect('publish: issue.publish succeeded', r.status === 200, JSON.stringify(r.body).slice(0, 300))
    const check = await q('editor', 'submission.byId', { id: submissionId })
    expect('publish: submission status PUBLISHED', check.body?.result?.data?.status === 'PUBLISHED', check.body?.result?.data?.status)
  })

  await sleep(2500)
  await test('regression: PUBLISHED-stage bots (promo-kit / archival) dispatch via issue.publish', async () => {
    const check = await q('editor', 'submission.byId', { id: submissionId })
    const sub = check.body?.result?.data
    const hasPromoKit = !!sub?.promoKit
    expect('regression: promoKit populated after issue.publish', hasPromoKit,
      hasPromoKit ? 'promoKit present' : 'promoKit MISSING — issue.publish is not calling dispatchStageBots')
  })

  await test('publish: a second publish of the same issue is rejected', async () => {
    const r = await m('editor', 'issue.publish', { id: issueId })
    expect('publish: double-publish rejected', errCode(r) === 'BAD_REQUEST', `status=${r.status} code=${errCode(r)}`)
  })

  // ═══ 9. PUBLIC PORTAL (no auth) ═══
  await test('portal: published article is publicly visible without auth', async () => {
    const r = await trpc(null, 'query', 'portal.articles', { tenantSlug: 'demo-journal', page: 1, limit: 50 })
    const found = (r.body?.result?.data?.submissions ?? []).some((s) => s.id === submissionId)
    expect('portal: published article visible on public portal', found, `status=${r.status}`)
  })

  // ═══ 10. WEBHOOK ROUTES LIVE (not just unit-mocked) ═══
  await test('webhook: Stripe webhook route responds (not 404) with an invalid signature', async () => {
    const res = await fetch(`${API}/webhooks/stripe`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 'bad' },
      body: JSON.stringify({ fake: true }),
    })
    expect('webhook: stripe route live', res.status !== 404, `status=${res.status}`)
  })

  await test('webhook: Copyleaks webhook route responds (not 404) with a bad token', async () => {
    const res = await fetch(`${API}/webhooks/copyleaks/${submissionId}/bad-token/completed`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    expect('webhook: copyleaks route live', res.status !== 404, `status=${res.status}`)
  })

  // ═══ 11. INFRA / HEALTH ═══
  await test('infra: /health reports postgres + redis + keycloak ok (200, not just the body)', async () => {
    const res = await fetch(`${API}/health`)
    const body = await res.json()
    expect('infra: health ok',
      res.status === 200 && body.status === 'ok' &&
      body.services?.postgres === 'ok' && body.services?.redis === 'ok' && body.services?.keycloak === 'ok',
      `status=${res.status} ${JSON.stringify(body)}`)
  })

  await test('infra: /health/live answers without checking any dependency', async () => {
    const res = await fetch(`${API}/health/live`)
    const body = await res.json()
    expect('infra: liveness ok', res.status === 200 && body.status === 'ok', `status=${res.status} ${JSON.stringify(body)}`)
  })

  // ── helper used above, defined after main() is declared so it's hoisted into scope ──
  // Note: listUsers lives on the `tenant` router, not `publication` (publication.ts
  // exports two routers from one file — easy to mix up).
  async function getUserId(who) {
    const email = ACCOUNTS[who].email
    const res = await q('editor', 'tenant.listUsers', {})
    const match = (res.body?.result?.data ?? []).find((u) => u.email === email)
    if (match) return match.id
    throw new Error(`could not resolve user id for ${who} (${email}) via tenant.listUsers — raw=${JSON.stringify(res.body).slice(0, 300)}`)
  }

  // ═══ SUMMARY ═══
  console.log('\n' + '='.repeat(70))
  const pass = results.filter((r) => r.pass).length
  const fail = results.filter((r) => !r.pass).length
  console.log(`RESULTS: ${pass} passed, ${fail} failed, ${results.length} total`)
  if (fail > 0) {
    console.log('\nFAILED:')
    for (const r of results.filter((x) => !x.pass)) console.log(`  - ${r.name}: ${r.detail}`)
  }
  console.log('='.repeat(70))
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
