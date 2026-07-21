// Compliance bots: SSRF-guard pure functions, link extraction, and the
// ethics/data-availability/license processor paths. AI and outbound fetch
// are stubbed — no real external network calls in this suite.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import type { Job } from 'bullmq'
import { isPrivateIPv4, isPrivateIPv6, safeFetchCheck } from '../src/lib/safe-fetch.js'
import { extractLinks, complianceProcessor } from '../src/processors/compliance.js'
import { prisma } from '../src/lib/prisma.js'
import { createFixture, type Fixture } from './helpers.js'

describe('isPrivateIPv4', () => {
  it.each([
    ['127.0.0.1', true], ['10.0.0.5', true], ['172.16.0.1', true], ['172.31.255.255', true],
    ['172.32.0.1', false], ['192.168.1.1', true], ['169.254.169.254', true], // cloud metadata
    ['100.64.0.1', true], // CGNAT
    ['0.0.0.0', true], ['224.0.0.1', true],
    ['8.8.8.8', false], ['1.1.1.1', false], ['93.184.216.34', false],
  ])('%s → private=%s', (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected)
  })
})

describe('isPrivateIPv6', () => {
  it.each([
    ['::1', true], ['fe80::1', true], ['fc00::1', true], ['fd12:3456::1', true], ['ff02::1', true],
    ['::ffff:127.0.0.1', true], ['::ffff:8.8.8.8', false],
    ['2001:4860:4860::8888', false], // public (Google DNS)
  ])('%s → private=%s', (ip, expected) => {
    expect(isPrivateIPv6(ip)).toBe(expected)
  })
})

describe('safeFetchCheck', () => {
  it('rejects non-http(s) schemes before any network call', async () => {
    await expect(safeFetchCheck('ftp://example.com/file')).rejects.toThrow(/scheme/)
    await expect(safeFetchCheck('file:///etc/passwd')).rejects.toThrow(/scheme/)
  })

  it('rejects loopback/private literal-IP targets (SSRF)', async () => {
    await expect(safeFetchCheck('http://127.0.0.1/')).rejects.toThrow(/non-public/)
    await expect(safeFetchCheck('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/non-public/)
    await expect(safeFetchCheck('http://[::1]/')).rejects.toThrow(/non-public/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    // localhost resolves to 127.0.0.1/::1 via the system resolver.
    await expect(safeFetchCheck('http://localhost:9999/')).rejects.toThrow(/non-public/)
  })
})

describe('extractLinks', () => {
  it('extracts bare URLs and normalizes trailing punctuation', () => {
    const links = extractLinks('Data at https://zenodo.org/record/123, also see https://osf.io/abc123.')
    expect(links).toEqual(['https://zenodo.org/record/123', 'https://osf.io/abc123'])
  })

  it('converts a bare DOI to a resolvable doi.org URL', () => {
    const links = extractLinks('Available via doi: 10.5281/zenodo.1234567')
    expect(links).toEqual(['https://doi.org/10.5281/zenodo.1234567'])
  })

  it('does not double-count a DOI already embedded in a URL', () => {
    const links = extractLinks('See https://doi.org/10.5281/zenodo.1234567 for data.')
    expect(links).toEqual(['https://doi.org/10.5281/zenodo.1234567'])
  })

  it('dedupes repeated links', () => {
    const links = extractLinks('https://osf.io/x and again https://osf.io/x')
    expect(links).toEqual(['https://osf.io/x'])
  })

  it('returns empty for statements with no links', () => {
    expect(extractLinks('Data available upon reasonable request.')).toEqual([])
  })
})

describe('complianceProcessor', () => {
  let fx: Fixture
  const KEY_BACKUP = process.env.ANTHROPIC_API_KEY

  beforeAll(async () => { fx = await createFixture('compliance') })
  afterAll(async () => {
    await fx.cleanup()
    if (KEY_BACKUP === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = KEY_BACKUP
  })
  afterEach(() => vi.unstubAllGlobals())

  const run = (type: string) =>
    complianceProcessor({ data: { type, submissionId: fx.submissionId } } as Job)

  describe('ETHICS', () => {
    it('flags missing statements deterministically without AI', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const report = await run('ETHICS')
      expect(report).toMatchObject({ status: 'warn' })
      expect((report as { missing: string[] }).missing).toEqual(
        expect.arrayContaining(['ethicsStatement', 'fundingStatement', 'coiStatement']),
      )
    })

    it('with AI: plausibility review stored on complianceReport', async () => {
      await prisma.submission.update({
        where: { id: fx.submissionId },
        data: {
          ethicsStatement: 'Approved by the Institutional Review Board, protocol #2026-001.',
          fundingStatement: 'Funded by NSF grant #12345.',
          coiStatement: 'The authors declare no conflict of interest.',
        },
      })
      process.env.ANTHROPIC_API_KEY = 'test-key'
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true, status: 200,
        json: async () => ({
          content: [{ type: 'text', text: JSON.stringify({ plausible: true, concerns: [], notes: 'Consistent.' }) }],
        }),
      })))
      const report = await run('ETHICS')
      expect(report).toMatchObject({ status: 'pass', plausible: true })

      const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
      expect((sub.complianceReport as { status: string }).status).toBe('pass')
    })
  })

  describe('DATA_AVAILABILITY', () => {
    it('warns when no statement is provided', async () => {
      await prisma.submission.update({
        where: { id: fx.submissionId }, data: { dataAvailabilityStatement: null },
      })
      const report = await run('DATA_AVAILABILITY')
      expect(report).toMatchObject({ status: 'warn', links: [] })
    })

    it('warns when the statement has no checkable links', async () => {
      await prisma.submission.update({
        where: { id: fx.submissionId },
        data: { dataAvailabilityStatement: 'Data available upon reasonable request.' },
      })
      const report = await run('DATA_AVAILABILITY')
      expect(report).toMatchObject({ status: 'warn', links: [] })
    })

    it('rejects an internal-network link as broken (SSRF-safe), never as a crash', async () => {
      await prisma.submission.update({
        where: { id: fx.submissionId },
        data: { dataAvailabilityStatement: 'Internal mirror at http://169.254.169.254/data' },
      })
      const report = await run('DATA_AVAILABILITY')
      expect(report).toMatchObject({ status: 'fail', brokenCount: 1 })
      const links = (report as { links: Array<{ ok: boolean; error?: string }> }).links
      expect(links[0].ok).toBe(false)
      expect(links[0].error).toMatch(/non-public/)
    })

    it('reports a resolving link as pass (stubbed fetch)', async () => {
      await prisma.submission.update({
        where: { id: fx.submissionId },
        data: { dataAvailabilityStatement: 'Data at https://zenodo.org/record/999999' },
      })
      vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
      const report = await run('DATA_AVAILABILITY')
      expect(report).toMatchObject({ status: 'pass', brokenCount: 0 })
    })
  })

  describe('LICENSE', () => {
    it('fails when license or agreement is missing', async () => {
      await prisma.submission.update({
        where: { id: fx.submissionId }, data: { licenseType: null, copyrightAgreedAt: null },
      })
      const report = await run('LICENSE')
      expect(report).toMatchObject({ status: 'fail' })
      expect((report as { missing: string[] }).missing).toEqual(
        expect.arrayContaining(['licenseType', 'copyrightAgreedAt']),
      )
    })

    it('passes once both are set, stored on licenseReport (not complianceReport)', async () => {
      await prisma.submission.update({
        where: { id: fx.submissionId },
        data: { licenseType: 'CC_BY', copyrightAgreedAt: new Date() },
      })
      const report = await run('LICENSE')
      expect(report).toMatchObject({ status: 'pass' })

      const sub = await prisma.submission.findUniqueOrThrow({ where: { id: fx.submissionId } })
      expect((sub.licenseReport as { status: string }).status).toBe('pass')
      // Confirms the earlier ETHICS-report clobber bug stays fixed: the two
      // fields are independent.
      expect(sub.complianceReport).not.toBeNull()
    })
  })

  it('rejects an unknown job type', async () => {
    await expect(run('MYSTERY')).rejects.toThrow()
  })
})
