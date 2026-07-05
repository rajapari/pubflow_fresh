// Stage 1 — Foundation: job schemas, queue registry, workflow transitions,
// role-enum parity, and the shared AI client.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  QUEUES,
  IntakeJobSchema,
  CopyEditJobSchema,
  TemplatePortJobSchema,
  LatexJobSchema,
  StyleManualSchema,
  UserRoleSchema,
  SubmissionStatusSchema,
  VALID_TRANSITIONS,
  isValidTransition,
} from '@pubflow/types'
import { $Enums } from '@pubflow/db'

const here = dirname(fileURLToPath(import.meta.url))
const UUID = '2f1e9a52-1a2b-4c3d-8e4f-5a6b7c8d9e0f'

describe('job schemas', () => {
  it('IntakeJob: parses valid payload and applies defaults', () => {
    const job = IntakeJobSchema.parse({
      type: 'INTAKE',
      submissionId: UUID,
      files: [{
        minioKey: 'assets/x/y.png', filename: 'y.png', mimeType: 'image/png',
        sizeBytes: 10, uploadedById: UUID,
      }],
    })
    expect(job.useVision).toBe(true)
    expect(job.files[0].assetId).toBeUndefined()
  })

  it('IntakeJob: rejects empty file list and bad uuid', () => {
    expect(() => IntakeJobSchema.parse({ type: 'INTAKE', submissionId: UUID, files: [] })).toThrow()
    expect(() => IntakeJobSchema.parse({
      type: 'INTAKE', submissionId: 'not-a-uuid',
      files: [{ minioKey: 'k', filename: 'f', mimeType: 'm', sizeBytes: 1, uploadedById: UUID }],
    })).toThrow()
  })

  it('CopyEditJob: defaults manual to INHOUSE, csl to apa, AI on', () => {
    const job = CopyEditJobSchema.parse({
      type: 'COPYEDIT', submissionId: UUID, copyEditId: UUID,
      inputMinioKey: 'k', inputFormat: 'docx',
    })
    expect(job.styleManual).toBe('INHOUSE')
    expect(job.cslStyle).toBe('apa')
    expect(job.applyAi).toBe(true)
    expect(job.houseRules).toEqual([])
  })

  it('CopyEditJob: rejects unknown manual and format', () => {
    expect(() => CopyEditJobSchema.parse({
      type: 'COPYEDIT', submissionId: UUID, copyEditId: UUID,
      inputMinioKey: 'k', inputFormat: 'pdf',
    })).toThrow()
    expect(() => CopyEditJobSchema.parse({
      type: 'COPYEDIT', submissionId: UUID, copyEditId: UUID,
      inputMinioKey: 'k', inputFormat: 'docx', styleManual: 'APA6',
    })).toThrow()
  })

  it('TemplatePortJob: accepts all source formats and both engines', () => {
    for (const sourceFormat of ['idml', 'indd', 'latex', 'pdf'] as const) {
      for (const targetEngine of ['SCRIBUS', 'LATEX'] as const) {
        expect(TemplatePortJobSchema.parse({
          type: 'TEMPLATE_PORT', templateId: UUID,
          sourceMinioKey: 'k', sourceFormat, targetEngine,
        }).targetEngine).toBe(targetEngine)
      }
    }
  })

  it('LatexJob: template fields are optional and preserved', () => {
    const bare = LatexJobSchema.parse({
      type: 'LATEX', submissionId: UUID, outputId: UUID, inputMinioKey: 'k',
    })
    expect(bare.templateMinioKey).toBeUndefined()
    const templated = LatexJobSchema.parse({
      type: 'LATEX', submissionId: UUID, outputId: UUID, inputMinioKey: 'k',
      templateMinioKey: 'templates/t/x.cls', templateClassName: 'myjournal',
    })
    expect(templated.templateClassName).toBe('myjournal')
  })
})

describe('queue registry', () => {
  it('every queue has a Worker registration in worker.ts', () => {
    const src = readFileSync(resolve(here, '../src/worker.ts'), 'utf-8')
    for (const [key] of Object.entries(QUEUES)) {
      expect(src, `QUEUES.${key} has no Worker registration`).toMatch(
        new RegExp(`new Worker\\(\\s*QUEUES\\.${key}\\b`),
      )
    }
  })
})

describe('workflow state machine', () => {
  const ALL = SubmissionStatusSchema.options

  it('terminal states have no outgoing transitions', () => {
    for (const terminal of ['PUBLISHED', 'REJECTED', 'WITHDRAWN'] as const) {
      expect(VALID_TRANSITIONS[terminal]).toEqual([])
    }
  })

  it('no state transitions to itself', () => {
    for (const from of ALL) {
      expect(VALID_TRANSITIONS[from], `${from} → ${from}`).not.toContain(from)
    }
  })

  it('every non-initial state is reachable', () => {
    const reachable = new Set<string>(['DRAFT'])
    let grew = true
    while (grew) {
      grew = false
      for (const from of ALL) {
        if (!reachable.has(from)) continue
        for (const to of VALID_TRANSITIONS[from]) {
          if (!reachable.has(to)) { reachable.add(to); grew = true }
        }
      }
    }
    for (const status of ALL) expect(reachable, `${status} unreachable`).toContain(status)
  })

  it('isValidTransition matches the table and rejects unknown pairs', () => {
    expect(isValidTransition('ACCEPTED', 'COPY_EDITING')).toBe(true)
    expect(isValidTransition('COPY_EDITING', 'ACCEPTED')).toBe(false)
    expect(isValidTransition('PROOF_REVIEW', 'TYPESETTING')).toBe(true)
    expect(isValidTransition('PUBLISHED', 'DRAFT')).toBe(false)
  })
})

describe('role enum parity (Zod ↔ Prisma)', () => {
  it('UserRoleSchema covers every Prisma UserRole', () => {
    const zodRoles = new Set<string>(UserRoleSchema.options)
    const prismaRoles = Object.values($Enums.UserRole)
    const missing = prismaRoles.filter((r) => !zodRoles.has(r))
    expect(missing, `roles missing from UserRoleSchema: ${missing.join(', ')}`).toEqual([])
  })

  it('StyleManualSchema matches Prisma StyleManual', () => {
    const zod = new Set<string>(StyleManualSchema.options)
    const prismaVals = Object.values($Enums.StyleManual)
    expect(prismaVals.filter((v) => !zod.has(v))).toEqual([])
    expect(StyleManualSchema.options.filter((v) => !(prismaVals as string[]).includes(v))).toEqual([])
  })
})

describe('AI client', () => {
  const KEY_BACKUP = process.env.ANTHROPIC_API_KEY
  beforeEach(() => { vi.unstubAllGlobals() })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (KEY_BACKUP === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = KEY_BACKUP
  })

  async function freshAi() {
    // ai.ts reads env at call time (aiEnabled) — module-level constants are
    // only URLs/timeouts, so a plain import is fine.
    return import('../src/lib/ai.js')
  }

  function stubFetchReturning(text: string) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text }] }),
    })))
  }

  it('aiEnabled reflects env key presence', async () => {
    const ai = await freshAi()
    delete process.env.ANTHROPIC_API_KEY
    expect(ai.aiEnabled()).toBe(false)
    process.env.ANTHROPIC_API_KEY = 'test-key'
    expect(ai.aiEnabled()).toBe(true)
  })

  it('throws a clear error when key missing', async () => {
    const ai = await freshAi()
    delete process.env.ANTHROPIC_API_KEY
    await expect(ai.aiText('hi')).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })

  it('aiJSON parses raw JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    stubFetchReturning('{"index": 2}')
    const ai = await freshAi()
    expect(await ai.aiJSON<{ index: number }>('x')).toEqual({ index: 2 })
  })

  it('aiJSON strips ```json fences', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    stubFetchReturning('```json\n{"a": [1,2]}\n```')
    const ai = await freshAi()
    expect(await ai.aiJSON('x')).toEqual({ a: [1, 2] })
  })

  it('aiJSON extracts JSON embedded in prose as last resort', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    stubFetchReturning('Sure! Here is the result: {"ok": true} Hope that helps.')
    const ai = await freshAi()
    expect(await ai.aiJSON('x')).toEqual({ ok: true })
  })

  it('aiJSON throws on non-JSON output', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    stubFetchReturning('I cannot answer that.')
    const ai = await freshAi()
    await expect(ai.aiJSON('x')).rejects.toThrow(/valid JSON/)
  })

  it('surfaces API errors with message', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    })))
    const ai = await freshAi()
    await expect(ai.aiText('x')).rejects.toThrow(/invalid x-api-key/)
  })
})
