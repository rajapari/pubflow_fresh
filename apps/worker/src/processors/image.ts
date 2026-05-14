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
    const metadata = JSON.parse(JSON.stringify(result.metadata)) as Prisma.InputJsonValue
    await prisma.asset.update({
      where: { id: d.assetId },
      data: {
        status: result.errors.length ? 'NEEDS_REVISION' : 'APPROVED',
        minioKeyProcessed: processedKey,
        dpi:      result.metadata['dpi'] as number | undefined,
        width:    result.metadata['width'] as number | undefined,
        height:   result.metadata['height'] as number | undefined,
        colorMode: (result.metadata['colorMode'] as string | undefined) ?? undefined,
        metadata,
        processedAt: new Date(),
      },
    })
    return { processedKey, errors: result.errors }
  } catch (err) {
    await prisma.asset.update({ where: { id: d.assetId }, data: { status: 'REJECTED', metadata: { error: String(err) } } })
    throw err
  }
}
