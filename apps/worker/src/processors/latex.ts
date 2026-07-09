import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { LatexJobSchema, QUEUES } from '@pubflow/types'
import { Queue } from 'bullmq'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'
import { getConnection } from '../lib/redis-connection.js'

const preflightQueue = new Queue(QUEUES.PREFLIGHT, { connection: getConnection() })

export async function latexProcessor(job: Job) {
  const d = LatexJobSchema.parse(job.data)
  await prisma.output.update({ where: { id: d.outputId }, data: { status: 'PROCESSING', jobId: job.id } })
  try {
    const input = await downloadFromMinio(d.inputMinioKey)

    // Ported publisher template (.cls) rides along as a compile resource.
    const resources: Record<string, string> = {}
    if (d.templateMinioKey) {
      const cls = await downloadFromMinio(d.templateMinioKey)
      const clsName = `${d.templateClassName ?? 'pubflowtemplate'}.cls`
      resources[clsName] = cls.toString('base64')
    }

    const res = await fetch(`${process.env.LATEX_SERVICE_URL ?? 'http://localhost:5001'}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: input.toString('utf-8'),
        latex: input.toString('utf-8'), // legacy key for older service builds
        engine: d.engine,
        documentClass: d.documentClass,
        passes: d.passes,
        resources,
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    const raw = await res.json() as {
      pdf: string
      logs?: string
      errors?: string[]
      metadata?: Record<string, unknown>
    }
    // Older service builds return only {pdf, size} — normalize.
    const result = { ...raw, logs: raw.logs ?? '', errors: raw.errors ?? [] }

    const pdf = Buffer.from(result.pdf, 'base64')
    const outputKey = `outputs/${d.submissionId}/submission_${d.outputId}.pdf`
    await uploadToMinio(outputKey, pdf, 'application/pdf')

    const updatedOutput = await prisma.output.update({
      where: { id: d.outputId },
      data: {
        status: result.errors.length ? 'FAILED' : 'COMPLETED',
        minioKey: outputKey,
        fileSizeBytes: pdf.length,
        generatedAt: new Date(),
        errorMessage: result.errors.length ? result.errors.join('\n') : null,
      },
    })

    // PDF/X pre-press gate — only for print PDFs, only once compilation
    // actually succeeded. submission.advanceStatus reads the report back
    // before allowing the move into PROOF_REVIEW.
    if (!result.errors.length && updatedOutput.format === 'PDF_PRINT') {
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
        toStatus: result.errors.length ? 'TYPESETTING' : 'PROOF_REVIEW',
        performedBy: 'SYSTEM',
        note: `LaTeX ${d.engine} compilation (${d.passes} passes)`,
        metadata: {
          engine: d.engine,
          passes: d.passes,
          fileSizeBytes: pdf.length,
          errorCount: result.errors.length,
          compileLogsLength: result.logs.length,
        } as Prisma.InputJsonValue,
      },
    })

    return { outputKey, fileSizeBytes: pdf.length, errors: result.errors }
  } catch (err) {
    await prisma.output.update({ where: { id: d.outputId }, data: { status: 'FAILED', errorMessage: String(err) } })
    throw err
  }
}
