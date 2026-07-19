// ── Promotion & accessibility bots (Phase D) ─────────────
// One processor, three job kinds routed on data.type:
//   ALT_TEXT  — vision AI drafts accessibility alt-text for a visual asset;
//               only fills Asset.altText when the author left it empty, and
//               marks the draft in Asset.metadata so the UI can show
//               "AI draft — review me". (Stage 7; lives here because it
//               shares the AI content-generation machinery.)
//   PROMO_KIT — on publish: plain-language lay summary, platform-sized
//               social-post drafts, and SEO/Scholar meta tags →
//               Submission.promoKit. Drafts only; humans post.
//   ARCHIVAL  — deposit seam (DOAJ/Portico/LOCKSS); records exactly why it
//               did not run until credentials are configured.
// Every AI path degrades to a 'skipped' report without ANTHROPIC_API_KEY.
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { MarketingJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio } from '../lib/storage.js'
import { aiEnabled, aiJSON } from '../lib/ai.js'

type Report = Record<string, unknown>

// ── ALT_TEXT ─────────────────────────────────────────────

const VISION_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

async function runAltText(submissionId: string, assetId: string): Promise<Report> {
  const asset = await prisma.asset.findUniqueOrThrow({
    where: { id: assetId },
    select: {
      altText: true, mimeType: true, minioKey: true, minioKeyProcessed: true,
      figureLabel: true, caption: true, assetType: true, metadata: true,
    },
  })

  if (asset.altText && asset.altText.trim()) {
    return { status: 'skipped', reason: 'Author already provided alt-text' }
  }
  if (!aiEnabled()) {
    return { status: 'skipped', reason: 'AI not configured — alt-text drafting requires ANTHROPIC_API_KEY' }
  }
  if (!VISION_MIME.has(asset.mimeType.toLowerCase())) {
    return { status: 'skipped', reason: `Unsupported image type for vision: ${asset.mimeType}` }
  }

  const buf = await downloadFromMinio(asset.minioKeyProcessed ?? asset.minioKey)
  if (buf.length > MAX_IMAGE_BYTES) {
    return { status: 'skipped', reason: 'Image exceeds 5MB vision budget (use processed/thumbnail rendition)' }
  }

  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId }, select: { title: true },
  })
  const context = [
    asset.figureLabel && `Figure label: ${asset.figureLabel}`,
    asset.caption && `Caption: ${asset.caption}`,
    `From the article: "${sub.title}"`,
    `Asset role: ${asset.assetType}`,
  ].filter(Boolean).join('\n')

  const r = await aiJSON<{ altText: string; longDescription?: string }>(
    `Write accessibility alt-text for this scholarly figure.\n${context}\n\n` +
    `Rules: describe what is VISIBLE and its takeaway, ≤ 250 characters, no ` +
    `"image of"/"figure showing" preamble, no invented data values. JSON: ` +
    `{"altText": string, "longDescription": string (2-3 sentences for complex figures, else omit)}`,
    {
      system: 'You write WCAG-compliant alt-text for scientific figures. Draft for human review.',
      maxTokens: 600,
      images: [{ mediaType: asset.mimeType.toLowerCase(), base64: buf.toString('base64') }],
    },
  )
  if (!r?.altText?.trim()) return { status: 'error', error: 'AI returned no altText' }

  const altText = r.altText.trim().slice(0, 250)
  await prisma.asset.update({
    where: { id: assetId },
    data: {
      altText,
      metadata: {
        ...(asset.metadata as Record<string, unknown> ?? {}),
        altTextDraft: {
          source: 'ai', needsReview: true,
          longDescription: r.longDescription ?? null,
          draftedAt: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
    },
  })
  return { status: 'done', altText }
}

// ── PROMO_KIT ────────────────────────────────────────────

/** Deterministic Highwire/Scholar + Dublin Core tags — no AI involved. */
export function buildSeoTags(sub: {
  title: string
  abstract: string | null
  keywords: string[]
  doi: string | null
  submittedAt: Date | null
  authorNames: string[]
  publicationTitle: string
  issn: string | null
}): Array<{ name: string; content: string }> {
  const tags: Array<{ name: string; content: string }> = [
    { name: 'citation_title', content: sub.title },
    { name: 'citation_journal_title', content: sub.publicationTitle },
    ...sub.authorNames.map((a) => ({ name: 'citation_author', content: a })),
    { name: 'DC.title', content: sub.title },
    ...sub.keywords.map((k) => ({ name: 'citation_keywords', content: k })),
  ]
  if (sub.issn) tags.push({ name: 'citation_issn', content: sub.issn })
  if (sub.doi) tags.push({ name: 'citation_doi', content: sub.doi })
  if (sub.abstract) tags.push({ name: 'description', content: sub.abstract.slice(0, 300) })
  if (sub.submittedAt) {
    tags.push({ name: 'citation_publication_date', content: sub.submittedAt.toISOString().slice(0, 10) })
  }
  return tags
}

interface PromoDrafts {
  laySummary: string
  posts: { x: string; linkedin: string; bluesky: string; mastodon: string }
  pressHeadline: string
}

async function runPromoKit(submissionId: string): Promise<Report> {
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: {
      author: { select: { firstName: true, lastName: true } },
      publication: { select: { title: true, issn: true } },
      assets: {
        where: { assetType: 'GRAPHICAL_ABSTRACT' },
        select: { id: true, minioKey: true },
        take: 1,
      },
    },
  })

  const authorNames = [
    [sub.author.firstName, sub.author.lastName].filter(Boolean).join(' '),
    ...(Array.isArray(sub.coAuthors)
      ? (sub.coAuthors as Array<{ name?: string }>).map((c) => c.name).filter((n): n is string => !!n)
      : []),
  ].filter(Boolean)

  // SEO tags are deterministic and always produced.
  const seoTags = buildSeoTags({
    title: sub.title, abstract: sub.abstract, keywords: sub.keywords,
    doi: sub.doi, submittedAt: sub.submittedAt, authorNames,
    publicationTitle: sub.publication.title, issn: sub.publication.issn,
  })

  const kit: Report = {
    seoTags,
    graphicalAbstractAssetId: sub.assets[0]?.id ?? null,
  }

  if (!aiEnabled()) {
    return { status: 'partial', ...kit, drafts: null, reason: 'AI not configured — SEO tags only' }
  }
  try {
    const link = sub.doi ? `https://doi.org/${sub.doi}` : '[link]'
    const drafts = await aiJSON<PromoDrafts>(
      `Article: "${sub.title}" in ${sub.publication.title}.\nAuthors: ${authorNames.join(', ')}\n` +
      `Abstract: ${sub.abstract ?? '(none)'}\nKeywords: ${sub.keywords.join(', ')}\nLink: ${link}\n\n` +
      `Produce: (1) a lay summary (~120 words, general audience, no hype, no invented ` +
      `results); (2) social drafts each ending with the link — x ≤ 260 chars, ` +
      `bluesky ≤ 280, mastodon ≤ 480, linkedin 2 short paragraphs; (3) a press ` +
      `headline ≤ 12 words. JSON: {"laySummary":string,"posts":{"x":string,` +
      `"linkedin":string,"bluesky":string,"mastodon":string},"pressHeadline":string}`,
      { system: 'You draft accurate, restrained science-communication copy for human review before posting.', maxTokens: 2000 },
    )
    return { status: 'done', ...kit, drafts }
  } catch (err) {
    return { status: 'partial', ...kit, drafts: null, error: String(err) }
  }
}

// ── ARCHIVAL ─────────────────────────────────────────────

async function runArchival(submissionId: string): Promise<Report> {
  void submissionId
  const targets = [
    { name: 'doaj', envKey: 'DOAJ_API_KEY' },
    { name: 'portico', envKey: 'PORTICO_FTP_HOST' },
    { name: 'clockss', envKey: 'CLOCKSS_ENDPOINT' },
  ].map((t) => ({
    ...t,
    configured: Boolean(process.env[t.envKey]),
  }))

  // Deposit adapters activate per-target when credentials exist; shipping
  // untested deposits of real articles to external archives is not acceptable.
  return {
    status: targets.some((t) => t.configured) ? 'pending-integration' : 'skipped',
    reason: 'No archival deposit executed — per-target adapters activate when credentials are configured and tested',
    targets,
  }
}

// ── Router ───────────────────────────────────────────────

async function save(
  submissionId: string,
  field: 'promoKit' | 'archivalReport' | null,
  report: Report,
  note: string,
) {
  const stamped = { ...report, ranAt: new Date().toISOString() }
  if (field) {
    await prisma.submission.update({
      where: { id: submissionId },
      data: { [field]: stamped as Prisma.InputJsonValue },
    })
  }
  const sub = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId }, select: { status: true },
  })
  await prisma.workflowLog.create({
    data: {
      submissionId, toStatus: sub.status, performedBy: 'SYSTEM', note,
      metadata: stamped as Prisma.InputJsonValue,
    },
  })
  return stamped
}

export async function marketingProcessor(job: Job) {
  const d = MarketingJobSchema.parse(job.data)
  switch (d.type) {
    case 'ALT_TEXT':
      return save(d.submissionId, null,
        await runAltText(d.submissionId, d.assetId), 'Alt-text draft')
    case 'PROMO_KIT':
      return save(d.submissionId, 'promoKit',
        await runPromoKit(d.submissionId), 'Promotion kit generated')
    case 'ARCHIVAL':
      return save(d.submissionId, 'archivalReport',
        await runArchival(d.submissionId), 'Archival deposit check')
  }
}
