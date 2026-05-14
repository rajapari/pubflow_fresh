import type { Job } from 'bullmq'
import { LatexJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'

export async function latexProcessor(job: Job) {
  const d = LatexJobSchema.parse(job.data)
  await prisma.output.update({ where: { id: d.outputId }, data: { status: 'PROCESSING', jobId: job.id?.toString() } })
  try {
    const input = await downloadFromMinio(d.inputMinioKey)
    const res   = await fetch(`${process.env.LATEX_SERVICE_URL}/compile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: input.toString('utf-8'), engine: d.engine, documentClass: d.documentClass, passes: d.passes }),
    })
    if (!res.ok) throw new Error(await res.text())
    const result    = await res.json() as { pdf: string }
    const pdf       = Buffer.from(result.pdf, 'base64')
    const outputKey = d.inputMinioKey.replace(/\.[^.]+$/, '_print.pdf')
    await uploadToMinio(outputKey, pdf, 'application/pdf')
    await prisma.output.update({ where: { id: d.outputId }, data: { status: 'COMPLETED', minioKey: outputKey, fileSizeBytes: pdf.length, generatedAt: new Date() } })
    return { outputKey }
  } catch (err) {
    await prisma.output.update({ where: { id: d.outputId }, data: { status: 'FAILED', errorMessage: String(err) } })
    throw err
  }
}
