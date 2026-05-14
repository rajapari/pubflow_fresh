// ── Pandoc processor ─────────────────────────────────────
import type { Job } from 'bullmq'
import { PandocJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'

export async function pandocProcessor(job: Job) {
  const d = PandocJobSchema.parse(job.data)
  await prisma.output.update({ where: { id: d.outputId }, data: { status: 'PROCESSING', jobId: job.id?.toString() } })
  try {
    const input = await downloadFromMinio(d.inputMinioKey)
    const res   = await fetch(`${process.env.PANDOC_SERVICE_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputFormat: d.inputFormat, outputFormat: d.outputFormat, content: input.toString('base64'), options: d.options }),
    })
    if (!res.ok) throw new Error(await res.text())
    const result     = await res.json() as { content: string }
    const out        = Buffer.from(result.content, 'base64')
    const ext        = d.outputFormat === 'jats' ? 'xml' : d.outputFormat
    const outputKey  = d.inputMinioKey.replace(/\.[^.]+$/, `_${d.outputFormat}.${ext}`)
    await uploadToMinio(outputKey, out, 'application/octet-stream')
    await prisma.output.update({ where: { id: d.outputId }, data: { status: 'COMPLETED', minioKey: outputKey, fileSizeBytes: out.length, generatedAt: new Date() } })
    return { outputKey }
  } catch (err) {
    await prisma.output.update({ where: { id: d.outputId }, data: { status: 'FAILED', errorMessage: String(err) } })
    throw err
  }
}
