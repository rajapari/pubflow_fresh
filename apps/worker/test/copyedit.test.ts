// Stage 3 — Copyedit style-manual engine: registry, LanguageTool integration
// (live), processor end-to-end with a markdown manuscript, profile resolution,
// and the failure path.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Job } from 'bullmq'
import { StyleManualSchema } from '@pubflow/types'
import { STYLE_MANUALS, getStyleManual } from '../src/lib/style-manuals.js'
import { copyeditProcessor, runLanguageTool } from '../src/processors/copyedit.js'
import { prisma } from '../src/lib/prisma.js'
import { createFixture, uploadFixture, type Fixture } from './helpers.js'

describe('style-manual registry', () => {
  it('covers every StyleManual enum value with complete config', () => {
    for (const manual of StyleManualSchema.options) {
      const cfg = STYLE_MANUALS[manual]
      expect(cfg, `missing config for ${manual}`).toBeDefined()
      expect(cfg.label.length).toBeGreaterThan(3)
      expect(cfg.cslStyle.length).toBeGreaterThan(1)
      expect(cfg.lt.language).toMatch(/^en(-[A-Z]{2})?$/)
      expect(cfg.aiGuidance.length).toBeGreaterThan(40)
    }
  })

  it('falls back to INHOUSE for unknown manuals', () => {
    expect(getStyleManual('NOT_A_MANUAL' as never)).toBe(STYLE_MANUALS.INHOUSE)
  })

  it('Harvard uses British English', () => {
    expect(STYLE_MANUALS.HARVARD.lt.language).toBe('en-GB')
  })
})

describe('runLanguageTool (live service)', () => {
  it('finds known errors in a short text', async () => {
    const matches = await runLanguageTool('She dont like the experimentt.', 'en-US', [], [])
    expect(matches.length).toBeGreaterThanOrEqual(2)
    const ids = matches.map((m) => m.rule.id)
    expect(ids).toContain('EN_CONTRACTION_SPELLING')
  })

  it('re-bases offsets across the 40k chunk boundary', async () => {
    // Filler of clean text pushes a known error into the second chunk.
    const filler = 'The quick brown fox jumps over the lazy dog. '.repeat(900) // ~41.4k chars
    const text = filler + 'She dont like it.'
    const errorAt = text.indexOf('dont')
    expect(errorAt).toBeGreaterThan(40_000) // sanity: error is in chunk 2

    const matches = await runLanguageTool(text, 'en-US', [], [])
    const contraction = matches.find((m) => m.rule.id === 'EN_CONTRACTION_SPELLING')
    expect(contraction).toBeDefined()
    // Offset must be re-based to the full document, not chunk-relative.
    expect(contraction!.offset).toBe(errorAt)
  }, 60_000)
})

describe('copyeditProcessor (end-to-end, markdown, AI off)', () => {
  let fx: Fixture
  let copyEditId: string

  beforeAll(async () => {
    fx = await createFixture('copyedit')
    const ce = await prisma.copyEdit.create({
      data: { submissionId: fx.submissionId, editorId: fx.copyEditorId },
    })
    copyEditId = ce.id
  })
  afterAll(async () => { await fx.cleanup() })

  const MANUSCRIPT_MD = [
    '# A Study of Test Manuscripts',
    '',
    'She dont like ambiguous results. The datas was collected over two years.',
    'We reports the findings in Table 1.',
  ].join('\n')

  it('produces a botReport with LT matches and archives it to MinIO', async () => {
    const key = await uploadFixture(
      `test-fixtures/${randomUUID()}/manuscript.md`, MANUSCRIPT_MD, 'text/markdown',
    )

    const result = await copyeditProcessor({
      data: {
        type: 'COPYEDIT',
        submissionId: fx.submissionId,
        copyEditId,
        inputMinioKey: key,
        inputFormat: 'markdown',
        styleManual: 'APA7',
        applyAi: false,
      },
    } as Job)

    expect(result.manual).toBe('APA7')
    expect(result.ltMatches).toBeGreaterThan(0)
    expect(result.reportKey).toMatch(/^copyedit-reports\//)

    const ce = await prisma.copyEdit.findUniqueOrThrow({ where: { id: copyEditId } })
    expect(ce.styleManual).toBe('APA7')
    const report = ce.botReport as Record<string, any>
    expect(report.manualLabel).toBe('APA 7th edition')
    expect(report.languageTool.matchCount).toBeGreaterThan(0)
    expect(report.ai).toMatchObject({ skipped: true })
    expect(report.charCount).toBe(MANUSCRIPT_MD.length)

    const log = await prisma.workflowLog.findFirst({
      where: { submissionId: fx.submissionId, note: { contains: 'Style bot' } },
    })
    expect(log).toBeTruthy()
  })

  it('resolves manual from a StyleProfile row (profile beats inline manual)', async () => {
    const profile = await prisma.styleProfile.create({
      data: {
        tenantId: fx.tenantId,
        publicationId: fx.publicationId,
        name: `AMA profile ${randomUUID().slice(0, 6)}`,
        manual: 'AMA11',
        cslStyle: 'american-medical-association',
        houseRules: ['Never use serial semicolons.'],
      },
    })
    const key = await uploadFixture(
      `test-fixtures/${randomUUID()}/manuscript.md`, MANUSCRIPT_MD, 'text/markdown',
    )

    const result = await copyeditProcessor({
      data: {
        type: 'COPYEDIT',
        submissionId: fx.submissionId,
        copyEditId,
        inputMinioKey: key,
        inputFormat: 'markdown',
        styleProfileId: profile.id,
        styleManual: 'INHOUSE', // must be overridden by the profile
        applyAi: false,
      },
    } as Job)

    expect(result.manual).toBe('AMA11')
    const ce = await prisma.copyEdit.findUniqueOrThrow({ where: { id: copyEditId } })
    expect(ce.styleManual).toBe('AMA11')
  })

  it('records the error on the copyedit row and rethrows on failure', async () => {
    await expect(copyeditProcessor({
      data: {
        type: 'COPYEDIT',
        submissionId: fx.submissionId,
        copyEditId,
        inputMinioKey: 'test-fixtures/does-not-exist.md',
        inputFormat: 'markdown',
        applyAi: false,
      },
    } as Job)).rejects.toThrow()

    const ce = await prisma.copyEdit.findUniqueOrThrow({ where: { id: copyEditId } })
    expect((ce.botReport as Record<string, unknown>).error).toBeTruthy()
  })
})
