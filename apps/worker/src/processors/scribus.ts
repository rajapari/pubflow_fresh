import type { Job } from 'bullmq'
import { ScribusJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'

export async function scribusProcessor(job: Job) {
  const d = ScribusJobSchema.parse(job.data)
  await prisma.output.update({ where: { id: d.outputId }, data: { status: 'PROCESSING', jobId: job.id?.toString() } })
  try {
    const [tmpl, content] = await Promise.all([downloadFromMinio(d.templateMinioKey), downloadFromMinio(d.contentMinioKey)])
    const res = await fetch(`${process.env.SCRIBUS_SERVICE_URL}/layout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template: tmpl.toString('base64'), content: content.toString('base64'), outputFormat: d.outputFormat }),
    })
    if (!res.ok) throw new Error(await res.text())
    const result    = await res.json() as { pdf: string }
    const pdf       = Buffer.from(result.pdf, 'base64')
    const outputKey = d.contentMinioKey.replace(/\.[^.]+$/, '_layout.pdf')
    await uploadToMinio(outputKey, pdf, 'application/pdf')
    await prisma.output.update({ where: { id: d.outputId }, data: { status: 'COMPLETED', minioKey: outputKey, fileSizeBytes: pdf.length, generatedAt: new Date() } })
    return { outputKey }
  } catch (err) {
    await prisma.output.update({ where: { id: d.outputId }, data: { status: 'FAILED', errorMessage: String(err) } })
    throw err
  }
}
