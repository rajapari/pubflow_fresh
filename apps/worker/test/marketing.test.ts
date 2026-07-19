// Phase D — promotion & accessibility bots: alt-text drafting rules,
// promo-kit generation with deterministic SEO tags, archival seam.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Job } from 'bullmq'
import { marketingProcessor } from '../src/processors/marketing.js'
import { buildSeoTags } from '../src/processors/marketing.js'
import { prisma } from '../src/lib/prisma.js'
import { createFixture, uploadFixture, TINY_PNG, type Fixture } from './helpers.js'

let fx: Fixture
const KEY_BACKUP = process.env.ANTHROPIC_API_KEY

beforeAll(async () => { fx = await createFixture('marketing') })
afterAll(async () => {
  await fx.cleanup()
  if (KEY_BACKUP === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = KEY_BACKUP
})
afterEach(() => vi.unstubAllGlobals())

function stubAi(json: unknown) {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ content: [{ type: 'text', text: JSON.stringify(json) }] }),
  })))
}

async function makeAsset(altText: string | null, mimeType = 'image/png') {
  const key = await uploadFixture(`test-fixtures/${randomUUID()}/fig.png`, TINY_PNG, mimeType)
  return prisma.asset.create({
    data: {
      submissionId: fx.submissionId, uploadedById: fx.authorId,
      filename: 'fig.png', assetType: 'FIGURE', minioKey: key,
      mimeType, fileSizeBytes: TINY_PNG.length, altText,
      caption: 'Growth over time',
    },
  })
}

describe('buildSeoTags (deterministic)', () => {
  it('emits Highwire + DC tags with authors, doi, issn, keywords', () => {
    const tags = buildSeoTags({
      title: 'T', abstract: 'A'.repeat(400), keywords: ['k1', 'k2'],
      doi: '10.1234/x', submittedAt: new Date('2026-03-04T10:00:00Z'),
      authorNames: ['Jane Doe', 'Ko Li'],
      publicationTitle: 'J', issn: '1234-5678',
    })
    const byName = (n: string) => tags.filter((t) => t.name === n)
    expect(byName('citation_author').map((t) => t.content)).toEqual(['Jane Doe', 'Ko Li'])
    expect(byName('citation_doi')[0].content).toBe('10.1234/x')
    expect(byName('citation_issn')[0].content).toBe('1234-5678')
    expect(byName('citation_publication_date')[0].content).toBe('2026-03-04')
    expect(byName('description')[0].content).toHaveLength(300)
    expect(byName('citation_keywords')).toHaveLength(2)
  })

  it('omits optional tags when data is absent', () => {
    const tags = buildSeoTags({
      title: 'T', abstract: null, keywords: [], doi: null,
      submittedAt: null, authorNames: [], publicationTitle: 'J', issn: null,
    })
    const names = tags.map((t) => t.name)
    expect(names).not.toContain('citation_doi')
    expect(names).not.toContain('description')
  })
})

describe('ALT_TEXT', () => {
  it('never overwrites author-provided alt-text', async () => {
    const asset = await makeAsset('Author wrote this already')
    const report = await marketingProcessor({
      data: { type: 'ALT_TEXT', submissionId: fx.submissionId, assetId: asset.id },
    } as Job)
    expect(report).toMatchObject({ status: 'skipped' })
    expect(String((report as { reason: string }).reason)).toMatch(/already provided/)
  })

  it('skips cleanly without an AI key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const asset = await makeAsset(null)
    const report = await marketingProcessor({
      data: { type: 'ALT_TEXT', submissionId: fx.submissionId, assetId: asset.id },
    } as Job)
    expect(report).toMatchObject({ status: 'skipped' })
  })

  it('with vision AI: fills altText and marks the draft for review', async () => {
    const asset = await makeAsset(null)
    stubAi({ altText: 'Line chart: treatment group doubles by week six.', longDescription: 'Two lines diverge.' })
    const report = await marketingProcessor({
      data: { type: 'ALT_TEXT', submissionId: fx.submissionId, assetId: asset.id },
    } as Job)
    expect(report).toMatchObject({ status: 'done' })

    const reloaded = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })
    expect(reloaded.altText).toMatch(/Line chart/)
    const meta = reloaded.metadata as { altTextDraft?: { source: string; needsReview: boolean } }
    expect(meta.altTextDraft).toMatchObject({ source: 'ai', needsReview: true })
  })

  it('skips non-vision mime types', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const asset = await makeAsset(null, 'application/postscript')
    const report = await marketingProcessor({
      data: { type: 'ALT_TEXT', submissionId: fx.submissionId, assetId: asset.id },
    } as Job)
    expect(report).toMatchObject({ status: 'skipped' })
  })
})

describe('PROMO_KIT', () => {
  it('without AI: partial kit still carries deterministic SEO tags', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const report = await marketingProcessor({
      data: { type: 'PROMO_KIT', submissionId: fx.submissionId },
    } as Job)
    expect(report).toMatchObject({ status: 'partial', drafts: null })
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
    const kit = sub.promoKit as { seoTags: Array<{ name: string }> }
    expect(kit.seoTags.some((t) => t.name === 'citation_title')).toBe(true)
  })

  it('with AI: lay summary + platform drafts stored', async () => {
    stubAi({
      laySummary: 'Plain words about the finding.',
      posts: { x: 'x post [link]', linkedin: 'li post', bluesky: 'bsky', mastodon: 'masto' },
      pressHeadline: 'Short headline',
    })
    const report = await marketingProcessor({
      data: { type: 'PROMO_KIT', submissionId: fx.submissionId },
    } as Job)
    expect(report).toMatchObject({ status: 'done' })
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
    const kit = sub.promoKit as { drafts: { posts: { x: string } } }
    expect(kit.drafts.posts.x).toContain('x post')
  })
})

describe('ARCHIVAL', () => {
  it('records unconfigured targets instead of failing', async () => {
    delete process.env.DOAJ_API_KEY
    const report = await marketingProcessor({
      data: { type: 'ARCHIVAL', submissionId: fx.submissionId },
    } as Job)
    expect(report).toMatchObject({ status: 'skipped' })
    const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
    const rep = sub.archivalReport as { targets: Array<{ name: string; configured: boolean }> }
    expect(rep.targets.map((t) => t.name)).toEqual(['doaj', 'portico', 'clockss'])
    expect(rep.targets.every((t) => !t.configured || t.name !== 'doaj')).toBe(true)
  })
})
