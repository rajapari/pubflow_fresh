import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { LatexJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'

export async function latexProcessor(job: Job) {
  const d = LatexJobSchema.parse(job.data)
  await prisma.output.update({ where: { id: d.outputId }, data: { status: 'PROCESSING', jobId: job.id } })
  try {
    const input = await downloadFromMinio(d.inputMinioKey)
    const res = await fetch(`${process.env.LATEX_SERVICE_URL ?? 'http://localhost:5003'}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latex: input.toString('utf-8'),
        engine: d.engine,
        documentClass: d.documentClass,
        passes: d.passes,
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    const result = await res.json() as {
      pdf: string
      logs: string
      errors: string[]
      metadata: Record<string, unknown>
    }

    const pdf = Buffer.from(result.pdf, 'base64')
    const outputKey = `outputs/${d.submissionId}/submission_${d.outputId}.pdf`
    await uploadToMinio(outputKey, pdf, 'application/pdf')

    await prisma.output.update({
      where: { id: d.outputId },
      data: {
        status: result.errors.length ? 'FAILED' : 'COMPLETED',
        minioKey: outputKey,
        fileSizeBytes: pdf.length,
        generatedAt: new Date(),
        errorMessage: result.errors.length ? result.errors.join('\n') : null,
      },
    })

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
