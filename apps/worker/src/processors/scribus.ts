import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { ScribusJobSchema, QUEUES } from '@pubflow/types'
import { Queue } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'
import { getConnection } from '../lib/redis-connection.js'

const preflightQueue = new Queue(QUEUES.PREFLIGHT, { connection: getConnection() })

export async function scribusProcessor(job: Job) {
  const d = ScribusJobSchema.parse(job.data)
  await prisma.output.update({ where: { id: d.outputId }, data: { status: 'PROCESSING', jobId: job.id } })
  try {
    // Fetch template, content, and all assets in parallel
    const [tmpl, content, ...assets] = await Promise.all([
      downloadFromMinio(d.templateMinioKey),
      downloadFromMinio(d.contentMinioKey),
      ...d.assetMinioKeys.map(k => downloadFromMinio(k)),
    ])

    const res = await fetch(`${process.env.SCRIBUS_SERVICE_URL ?? 'http://localhost:5000'}/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: tmpl.toString('base64'),
        content: content.toString('utf-8'),
        assets: assets.map((a, i) => ({
          key: d.assetMinioKeys[i],
          data: a.toString('base64'),
        })),
        outputFormat: d.outputFormat,
      }),
    })
    if (!res.ok) throw new Error(await res.text())

    const result = await res.json() as {
      pdf: string
      errors: string[]
      warnings: string[]
      metadata: Record<string, unknown>
    }

    const pdf = Buffer.from(result.pdf, 'base64')
    const outputKey = `outputs/${d.submissionId}/submission_${d.outputId}.pdf`
    await uploadToMinio(outputKey, pdf, 'application/pdf')

    const hasErrors = (result.errors ?? []).length > 0
    const updatedOutput = await prisma.output.update({
      where: { id: d.outputId },
      data: {
        status: hasErrors ? 'FAILED' : 'COMPLETED',
        minioKey: outputKey,
        fileSizeBytes: pdf.length,
        generatedAt: new Date(),
        errorMessage: hasErrors ? (result.errors ?? []).join('\n') : null,
      },
    })

    if (!hasErrors && updatedOutput.format === 'PDF_PRINT') {
      await preflightQueue.add('preflight', {
        type: 'PREFLIGHT',
        submissionId: d.submissionId,
        outputId: d.outputId,
        inputMinioKey: outputKey,
      })
    }

    // Log workflow state change
    await prisma.workflowLog.create({
      data: {
        submissionId: d.submissionId,
        toStatus: hasErrors ? 'TYPESETTING' : 'PROOF_REVIEW',
        performedBy: 'SYSTEM',
        note: `Scribus layout (${d.outputFormat})`,
        metadata: {
          outputFormat: d.outputFormat,
          fileSizeBytes: pdf.length,
          assetCount: d.assetMinioKeys.length,
          errorCount: (result.errors ?? []).length,
          warningCount: (result.warnings ?? []).length,
        } as Prisma.InputJsonValue,
      },
    })

    return { outputKey, fileSizeBytes: pdf.length, errors: result.errors, warnings: result.warnings }
  } catch (err) {
    await prisma.output.update({ where: { id: d.outputId }, data: { status: 'FAILED', errorMessage: String(err) } })
    throw err
  }
}
