import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { ImageJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'

export async function imageProcessor(job: Job) {
  const d = ImageJobSchema.parse(job.data)
  await prisma.asset.update({ where: { id: d.assetId }, data: { status: 'PROCESSING' } })
  try {
    const input = await downloadFromMinio(d.inputMinioKey)
    // Call Sharp/GIMP processing service (lightweight HTTP wrapper)
    const res = await fetch(`${process.env.IMAGE_SERVICE_URL ?? 'http://localhost:5002'}/process`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: input.toString('base64'), tasks: d.tasks, targetDpi: d.targetDpi, targetColorMode: d.targetColorMode }),
    })
    if (!res.ok) throw new Error(await res.text())
    const result = await res.json() as { processed: string; metadata: Record<string,unknown>; errors: string[]; mimeType: string }
    const processedKey = d.inputMinioKey.replace(/(\.[^.]+)$/, '_processed$1')
    await uploadToMinio(processedKey, Buffer.from(result.processed, 'base64'), result.mimeType)
    // Normalize and validate metadata
    const rawMetadata = result.metadata ?? {}
    const parseNumber = (v: unknown) => {
      if (typeof v === 'number') return Math.round(v)
      if (typeof v === 'string') {
        const n = parseFloat(v)
        return Number.isNaN(n) ? undefined : Math.round(n)
      }
      return undefined
    }

    const dpi = parseNumber(rawMetadata['dpi'])
    const width = parseNumber(rawMetadata['width'])
    const height = parseNumber(rawMetadata['height'])
    const colorModeRaw = typeof rawMetadata['colorMode'] === 'string' ? String(rawMetadata['colorMode']).toUpperCase() : undefined
    const validColorModes = ['RGB','CMYK','GRAYSCALE','LAB']
    const colorMode = colorModeRaw && validColorModes.includes(colorModeRaw) ? colorModeRaw as 'RGB'|'CMYK'|'GRAYSCALE'|'LAB' : null

    // Validation checks
    const validationIssues: string[] = [...(result.errors ?? [])]
    const needsDpiFix = d.tasks.includes('VALIDATE_DPI') && (dpi === undefined || dpi < d.targetDpi)
    if (needsDpiFix) validationIssues.push(`DPI ${dpi ?? 'unknown'} < ${d.targetDpi}`)

    const needsColorFix = d.tasks.includes('VALIDATE_COLORMODE') && !!d.targetColorMode && colorMode !== d.targetColorMode
    if (needsColorFix) validationIssues.push(`ColorMode ${colorMode ?? 'unknown'} != ${d.targetColorMode}`)

    const finalStatus = validationIssues.length ? 'NEEDS_REVISION' : 'APPROVED'

    const metadata = JSON.parse(JSON.stringify(result.metadata)) as Prisma.InputJsonValue
    const augmentedMetadata = {
      ...((metadata && typeof metadata === 'object') ? metadata : {}),
      validation: {
        needsDpiFix,
        needsColorFix,
        dpi,
        width,
        height,
        colorMode,
        targetDpi: d.targetDpi,
        targetColorMode: d.targetColorMode,
        issues: validationIssues,
      },
    } as Prisma.InputJsonValue

    await prisma.asset.update({
      where: { id: d.assetId },
      data: {
        status: finalStatus,
        minioKeyProcessed: processedKey,
        dpi,
        width,
        height,
        colorMode,
        metadata: augmentedMetadata,
        processedAt: new Date(),
      },
    })

    return { processedKey, issues: validationIssues }
  } catch (err) {
    await prisma.asset.update({ where: { id: d.assetId }, data: { status: 'REJECTED', metadata: { error: String(err) } } })
    throw err
  }
}
