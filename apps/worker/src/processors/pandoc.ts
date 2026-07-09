// ── Pandoc processor ─────────────────────────────────────
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { PandocJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio, uploadToMinio } from '../lib/storage.js'

export async function pandocProcessor(job: Job) {
  const d = PandocJobSchema.parse(job.data)
  await prisma.output.update({ where: { id: d.outputId }, data: { status: 'PROCESSING', jobId: job.id } })
  try {
    const input = await downloadFromMinio(d.inputMinioKey)
    const res = await fetch(`${process.env.PANDOC_SERVICE_URL ?? 'http://localhost:4000'}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputFormat: d.inputFormat,
        outputFormat: d.outputFormat,
        content: input.toString('base64'),
        options: d.options,
      }),
    })
    if (!res.ok) throw new Error(await res.text())

    const result = await res.json() as {
      content: string
      errors: string[]
      warnings: string[]
      metadata: Record<string, unknown>
    }

    const out = Buffer.from(result.content, 'base64')
    const ext = d.outputFormat === 'jats' ? 'xml' : d.outputFormat
    const outputKey = `outputs/${d.submissionId}/submission_${d.outputId}.${ext}`

    const MIME: Record<string, string> = {
      pdf:    'application/pdf',
      epub:   'application/epub+zip',
      html:   'text/html; charset=utf-8',
      jats:   'application/xml',
      docx:   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      bibtex: 'text/x-bibtex',
    }
    await uploadToMinio(outputKey, out, MIME[d.outputFormat] ?? 'application/octet-stream')

    const hasErrors = (result.errors ?? []).length > 0
    await prisma.output.update({
      where: { id: d.outputId },
      data: {
        status: hasErrors ? 'FAILED' : 'COMPLETED',
        minioKey: outputKey,
        fileSizeBytes: out.length,
        generatedAt: new Date(),
        errorMessage: hasErrors ? (result.errors ?? []).join('\n') : null,
      },
    })

    // Log workflow state change
    await prisma.workflowLog.create({
      data: {
        submissionId: d.submissionId,
        toStatus: hasErrors ? 'ARTWORK_PROCESSING' : 'TYPESETTING',
        performedBy: 'SYSTEM',
        note: `Pandoc conversion (${d.inputFormat} → ${d.outputFormat})`,
        metadata: {
          inputFormat: d.inputFormat,
          outputFormat: d.outputFormat,
          fileSizeBytes: out.length,
          citationStyle: d.options.citationStyle,
          errorCount: (result.errors ?? []).length,
          warningCount: (result.warnings ?? []).length,
        } as Prisma.InputJsonValue,
      },
    })

    return { outputKey, fileSizeBytes: out.length, errors: result.errors, warnings: result.warnings }
  } catch (err) {
    await prisma.output.update({ where: { id: d.outputId }, data: { status: 'FAILED', errorMessage: String(err) } })
    throw err
  }
}
