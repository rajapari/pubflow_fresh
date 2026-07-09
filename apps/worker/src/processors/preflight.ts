// ── Preflight Bot ────────────────────────────────────────
// Pre-press gate for PDF_PRINT outputs: embedded fonts, trim/bleed boxes,
// PDF/X OutputIntent, print-permission — see services/preflight/server.py.
// Writes Output.preflightReport; submission.advanceStatus reads it back to
// block the transition into PROOF_REVIEW on a 'fail'.
import type { Job } from 'bullmq'
import type { Prisma } from '@pubflow/db'
import { PreflightJobSchema } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { downloadFromMinio } from '../lib/storage.js'

export async function preflightProcessor(job: Job) {
  const d = PreflightJobSchema.parse(job.data)
  try {
    const pdf = await downloadFromMinio(d.inputMinioKey)

    const res = await fetch(`${process.env.PREFLIGHT_SERVICE_URL ?? 'http://localhost:4200'}/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf: pdf.toString('base64') }),
    })
    if (!res.ok) throw new Error(await res.text())

    const body = await res.json() as { report: { status: 'pass' | 'warn' | 'fail'; checks: unknown[] } }
    const preflightReport = { ...body.report, ranAt: new Date().toISOString() }

    await prisma.output.update({
      where: { id: d.outputId },
      data: { preflightReport: preflightReport as unknown as Prisma.InputJsonValue },
    })

    await prisma.workflowLog.create({
      data: {
        submissionId: d.submissionId,
        toStatus: 'TYPESETTING',
        performedBy: 'SYSTEM',
        note: `Preflight check: ${body.report.status}`,
        metadata: preflightReport as unknown as Prisma.InputJsonValue,
      },
    })

    return preflightReport
  } catch (err) {
    const preflightReport = { status: 'error' as const, checks: [], error: String(err), ranAt: new Date().toISOString() }
    await prisma.output.update({
      where: { id: d.outputId },
      data: { preflightReport: preflightReport as unknown as Prisma.InputJsonValue },
    })
    throw err
  }
}
