// ── XML/EPUB Validator Bot (Stage 11) ────────────────────
// Publication gate for generated JATS XML and EPUB outputs: JATS structural
// checks (front matter, identifiers, graphics hrefs) and epubcheck — see
// services/xmlvalidate/server.py. Writes Output.validationReport with the
// same shape as preflightReport; a 'fail' should block PUBLISHED the same
// way preflight blocks PROOF_REVIEW.
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { XmlValidateJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio } from '../lib/storage.js'

export async function xmlvalidateProcessor(job: Job) {
  const d = XmlValidateJobSchema.parse(job.data)
  try {
    const file = await downloadFromMinio(d.inputMinioKey)

    const res = await fetch(`${process.env.XMLVALIDATE_SERVICE_URL ?? 'http://localhost:4300'}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: d.kind, content: file.toString('base64') }),
    })
    if (!res.ok) throw new Error(await res.text())

    const body = await res.json() as { status: 'pass' | 'warn' | 'fail'; checks: unknown[] }
    const validationReport = { ...body, ranAt: new Date().toISOString() }

    await prisma.output.update({
      where: { id: d.outputId },
      data: { validationReport: validationReport as unknown as Prisma.InputJsonValue },
    })

    await prisma.workflowLog.create({
      data: {
        submissionId: d.submissionId,
        toStatus: 'APPROVED',
        performedBy: 'SYSTEM',
        note: `${d.kind.toUpperCase()} validation: ${body.status}`,
        metadata: validationReport as unknown as Prisma.InputJsonValue,
      },
    })

    return validationReport
  } catch (err) {
    const validationReport = {
      status: 'error' as const, checks: [], error: String(err), ranAt: new Date().toISOString(),
    }
    await prisma.output.update({
      where: { id: d.outputId },
      data: { validationReport: validationReport as unknown as Prisma.InputJsonValue },
    })
    throw err
  }
}
