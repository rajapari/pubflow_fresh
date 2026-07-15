// Stage 7 — Image QA bot: DPI/color-mode validation, thumbnail generation,
// and the Asset row contract, against the live services/image service.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Job } from 'bullmq'
import { randomUUID } from 'node:crypto'
import { imageProcessor } from '../src/processors/image.js'
import { prisma } from '../src/lib/prisma.js'
import { createFixture, uploadFixture, TINY_PNG, type Fixture } from './helpers.js'

let fx: Fixture
beforeAll(async () => { fx = await createFixture('image') })
afterAll(async () => { await fx.cleanup() })

async function makeAsset(minioKey: string) {
  return prisma.asset.create({
    data: {
      submissionId: fx.submissionId,
      uploadedById: fx.authorId,
      filename: 'figure1.png',
      assetType: 'FIGURE',
      minioKey,
      mimeType: 'image/png',
      fileSizeBytes: TINY_PNG.length,
    },
  })
}

const run = (assetId: string, inputMinioKey: string, tasks: string[], targetDpi = 300) =>
  imageProcessor({
    data: {
      type: 'IMAGE', assetId, submissionId: fx.submissionId,
      inputMinioKey, tasks, targetDpi,
    },
  } as Job)

describe('imageProcessor (DB + live image service)', () => {
  it('full artwork-QA task set on a DPI-less image: NEEDS_REVISION, all fields populated', async () => {
    const key = await uploadFixture(`test-fixtures/${randomUUID()}/figure.png`, TINY_PNG, 'image/png')
    const asset = await makeAsset(key)

    await run(asset.id, key, ['VALIDATE_DPI', 'VALIDATE_COLORMODE', 'EXTRACT_METADATA', 'GENERATE_THUMBNAIL'])

    const reloaded = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })
    expect(reloaded.status).toBe('NEEDS_REVISION') // TINY_PNG carries no DPI info
    expect(reloaded.width).toBe(1)
    expect(reloaded.height).toBe(1)
    expect(reloaded.colorMode).toBe('RGB')
    expect(reloaded.dpi).toBeNull()
    expect(reloaded.minioKeyProcessed).toBeTruthy()
    expect(reloaded.processedAt).toBeTruthy()
    expect((reloaded.metadata as { validation?: { issues?: string[] } }).validation?.issues?.length).toBeGreaterThan(0)
  })

  it('metadata-only tasks (no VALIDATE_*) approve regardless of actual DPI', async () => {
    const key = await uploadFixture(`test-fixtures/${randomUUID()}/figure.png`, TINY_PNG, 'image/png')
    const asset = await makeAsset(key)

    await run(asset.id, key, ['EXTRACT_METADATA'])

    const reloaded = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })
    expect(reloaded.status).toBe('APPROVED')
  })

  it('color-mode mismatch is flagged when a target is given', async () => {
    const key = await uploadFixture(`test-fixtures/${randomUUID()}/figure.png`, TINY_PNG, 'image/png')
    const asset = await makeAsset(key)

    await imageProcessor({
      data: {
        type: 'IMAGE', assetId: asset.id, submissionId: fx.submissionId,
        inputMinioKey: key, tasks: ['VALIDATE_COLORMODE'], targetDpi: 300,
        targetColorMode: 'CMYK',
      },
    } as Job)

    const reloaded = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })
    expect(reloaded.status).toBe('NEEDS_REVISION')
    expect(reloaded.colorMode).toBe('RGB') // actual mode, not the target
  })

  it('a corrupt image is rejected, not silently accepted', async () => {
    const key = await uploadFixture(`test-fixtures/${randomUUID()}/garbage.png`, Buffer.from('not an image'), 'image/png')
    const asset = await makeAsset(key)

    await expect(run(asset.id, key, ['EXTRACT_METADATA'])).rejects.toThrow()

    const reloaded = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } })
    expect(reloaded.status).toBe('REJECTED')
  })
})
