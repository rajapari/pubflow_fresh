import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import type { AnyRouter } from '@trpc/server'
import { router, protectedProcedure, editorProcedure, chiefEditorProcedure } from '../trpc/procedures.js'
import { CreateSubmissionSchema, EditorialDecisionSchema,
         SubmissionStatusSchema, SubmissionStatus, isValidTransition } from '@pubflow/types'
import { MinioStorage } from '../plugins/minio.js'
import { QUEUES } from '@pubflow/types'
import { dispatchStageBots } from '../lib/bot-dispatch.js'
import { requireEnv } from '../lib/env.js'
import { createHmac } from 'crypto'
import { Client as MinioClient } from 'minio'

// ── Minimal DOCX generator (no external dependencies) ─────────────────────────
// A DOCX is a ZIP (STORE, no compression) containing 4 XML files.
// We build the ZIP binary from scratch using CRC-32 + local/central headers.

function _crc32(buf: Buffer): number {
  const t: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  let crc = 0xFFFFFFFF
  for (const b of buf) crc = (crc >>> 8) ^ t[(crc ^ b) & 0xFF]
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function _zipLocal(name: string, data: Buffer): Buffer {
  const n = Buffer.from(name), c = _crc32(data)
  const h = Buffer.alloc(30 + n.length)
  h.writeUInt32LE(0x04034B50,  0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6)
  h.writeUInt16LE(0,           8); h.writeUInt32LE(c, 14)
  h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22)
  h.writeUInt16LE(n.length,   26); n.copy(h, 30)
  return Buffer.concat([h, data])
}

function _zipCentral(name: string, data: Buffer, offset: number): Buffer {
  const n = Buffer.from(name), c = _crc32(data)
  const h = Buffer.alloc(46 + n.length)
  h.writeUInt32LE(0x02014B50,  0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6)
  h.writeUInt32LE(c,          16); h.writeUInt32LE(data.length, 20)
  h.writeUInt32LE(data.length, 24); h.writeUInt16LE(n.length, 28)
  h.writeUInt32LE(offset,     42); n.copy(h, 46)
  return h
}

function createBlankDocxBuffer(): Buffer {
  const files: Array<[string, Buffer]> = [
    ['[Content_Types].xml', Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
    )],
    ['_rels/.rels', Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
    )],
    ['word/document.xml', Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>'
    )],
    ['word/_rels/document.xml.rels', Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    )],
  ]

  const locals: Buffer[] = [], centrals: Buffer[] = []
  let off = 0
  for (const [name, data] of files) {
    const l = _zipLocal(name, data)
    centrals.push(_zipCentral(name, data, off))
    locals.push(l)
    off += l.length
  }
  const cdir = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054B50,     0)
  eocd.writeUInt16LE(files.length,   8)
  eocd.writeUInt16LE(files.length,  10)
  eocd.writeUInt32LE(cdir.length,   12)
  eocd.writeUInt32LE(off,           16)
  return Buffer.concat([...locals, cdir, eocd])
}

const FORMAT_TO_FILETYPE: Record<string, string> = {
  DOCX: 'docx', ODT: 'odt', RTF: 'rtf', PDF: 'pdf', MARKDOWN: 'txt',
}

function signJwt(payload: object, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig    = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

type ManuscriptFormat = 'DOCX' | 'LATEX' | 'MARKDOWN' | 'ODT' | 'RTF' | 'PDF' | 'ZIP'

export const submissionRouter = router({

  list: protectedProcedure
    .input(z.object({
      status: SubmissionStatusSchema.optional(),
      publicationId: z.string().uuid().optional(),
      page:  z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const where: Record<string, unknown> = { tenantId: user.tenantId }
      if (input.status)        where['status']        = input.status
      if (input.publicationId) where['publicationId'] = input.publicationId
      if (user.role === 'AUTHOR') where['authorId']   = user.id

      const [submissions, total] = await Promise.all([
        prisma.submission.findMany({
          where,
          include: {
            author:      { select: { id:true, firstName:true, lastName:true, email:true } },
            publication: { select: { id:true, title:true } },
            _count:      { select: { reviews:true } },
          },
          orderBy: { createdAt: 'desc' },
          skip:  (input.page - 1) * input.limit,
          take:  input.limit,
        }),
        prisma.submission.count({ where }),
      ])
      return { submissions, total, page: input.page, limit: input.limit }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId },
        include: {
          author:      true,
          publication: true,
          manuscripts: { orderBy: { version: 'desc' } },
          reviews:     { include: { reviewer: { select: { id:true, firstName:true, lastName:true } } } },
          assets:      true,
          outputs:     { orderBy: { createdAt: 'desc' } },
          decisions:   { include: { editor: true }, orderBy: { createdAt: 'desc' } },
          workflowLogs:{ orderBy: { createdAt: 'desc' }, take: 20 },
        },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (user.role === 'AUTHOR' && sub.authorId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })
      return sub
    }),

  create: protectedProcedure
    .input(CreateSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const pub = await prisma.publication.findFirst({
        where: { id: input.publicationId, tenantId: user.tenantId },
      })
      if (!pub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Publication not found' })

      return prisma.submission.create({
        data: {
          tenantId:      user.tenantId,
          publicationId: input.publicationId,
          authorId:      user.id,
          title:         input.title,
          abstract:      input.abstract,
          keywords:      input.keywords,
          coAuthors:     input.coAuthors,
          status:        'DRAFT',
          workflowLogs:  { create: { toStatus: 'DRAFT', performedBy: user.id, note: 'Created' } },
        },
        include: { publication: true },
      })
    }),

  submit: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId, authorId: user.id },
        include: { manuscripts: { where: { isLatest: true } } },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      // First submission goes to SUBMITTED; resubmitting after an editorial
      // revision request goes to REVISED (which re-enters peer review).
      const toStatus = sub.status === 'REVISION_REQUIRED' ? 'REVISED' as const : 'SUBMITTED' as const
      if (!isValidTransition(sub.status, toStatus))
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot submit from ${sub.status} status` })
      if (sub.manuscripts.length === 0)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload a manuscript file first' })

      const updated = await prisma.submission.update({
        where: { id: input.id },
        data: {
          status: toStatus, submittedAt: new Date(),
          workflowLogs: { create: { fromStatus: sub.status, toStatus, performedBy: user.id } },
        },
      })

      await queues[QUEUES.NOTIFICATION].add('submission-received', {
        type: 'NOTIFICATION', to: [], template: 'SUBMISSION_RECEIVED',
        data: { submissionId: sub.id, title: sub.title },
      })

      // Stage bots: intake classifier separates supplementary/graphical-abstract files.
      await dispatchStageBots(prisma, queues, sub.id, toStatus)

      return updated
    }),

  // Author reopens a SUBMITTED manuscript to rewrite it before editorial review
  // begins. The submitted file is preserved as a version; edits go to a fresh
  // copy, and the author resubmits via the normal submit flow when done.
  reopenForRevision: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, minio } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId, authorId: user.id },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!isValidTransition(sub.status, 'DRAFT'))
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This submission is already in editorial review and can no longer be reopened. Wait for the editor\'s decision.',
        })

      const latest = await prisma.manuscript.findFirst({
        where: { submissionId: input.id, isLatest: true },
        orderBy: { uploadedAt: 'desc' },
      })

      // Snapshot: copy the submitted file to a new object so the new working
      // version has its own key (and a fresh OnlyOffice document cache slot),
      // while the submitted version stays untouched in the history.
      if (latest) {
        const filename  = latest.minioKey.split('/').pop() ?? 'manuscript.docx'
        // Same folder as the source manuscript — all versions stay together
        const newKey    = MinioStorage.siblingKey(latest.minioKey, filename)
        const buffer    = await minio.download(latest.minioKey)
        await minio.putObject(newKey, buffer)

        await prisma.$transaction([
          prisma.manuscript.updateMany({
            where: { submissionId: input.id, isLatest: true },
            data:  { isLatest: false },
          }),
          prisma.manuscript.create({
            data: {
              submissionId:  input.id,
              format:        latest.format,
              minioPath:     `s3://pubflow-files/${newKey}`,
              minioKey:      newKey,
              fileSizeBytes: latest.fileSizeBytes,
              version:       latest.version + 1,
              isLatest:      true,
            },
          }),
        ])
      }

      return prisma.submission.update({
        where: { id: input.id },
        data: {
          status: 'DRAFT',
          workflowLogs: { create: {
            fromStatus: sub.status, toStatus: 'DRAFT',
            performedBy: user.id, note: 'Reopened by author for revision',
          }},
        },
      })
    }),

  makeDecision: chiefEditorProcedure
    .input(z.object({ submissionId: z.string().uuid() }).merge(EditorialDecisionSchema))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues, minio } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      const nextStatus = {
        ACCEPT: 'ACCEPTED', MINOR_REVISION: 'REVISION_REQUIRED',
        MAJOR_REVISION: 'REVISION_REQUIRED', REJECT: 'REJECTED', DESK_REJECT: 'REJECTED',
      }[input.decision] as SubmissionStatus

      // A decision is only meaningful while the manuscript is under evaluation.
      // Without this check an editor could re-decide a PUBLISHED article and
      // silently pull it back into production.
      if (!isValidTransition(sub.status as SubmissionStatus, nextStatus))
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot record a ${input.decision} decision while the submission is in ${sub.status} status`,
        })

      // Revision-round cap: at most 3 author↔reviewer rounds. After the third,
      // the editor must make a final call — accept or reject.
      const MAX_REVISION_ROUNDS = 3
      const isRevisionDecision  = nextStatus === 'REVISION_REQUIRED'
      if (isRevisionDecision && sub.revisionRound >= MAX_REVISION_ROUNDS)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `This manuscript has completed ${MAX_REVISION_ROUNDS} revision rounds — the maximum allowed. Please make a final decision: Accept or Reject.`,
        })

      await prisma.$transaction([
        prisma.editorialDecision.create({
          data: { submissionId: input.submissionId, editorId: user.id,
                  decision: input.decision, notes: input.notes },
        }),
        prisma.submission.update({
          where: { id: input.submissionId },
          data: {
            status: nextStatus,
            ...(isRevisionDecision ? { revisionRound: { increment: 1 } } : {}),
            workflowLogs: { create: {
              fromStatus: sub.status, toStatus: nextStatus,
              performedBy: user.id,
              note: `Decision: ${input.decision}` +
                    (isRevisionDecision ? ` (revision round ${sub.revisionRound + 1} of ${MAX_REVISION_ROUNDS})` : ''),
            }},
          },
        }),
      ])

      // Version immutability between rounds: the manuscript the reviewers saw
      // must stay untouched. Snapshot it as a new numbered version so the
      // author's revision edits land on a fresh copy (fresh editor cache key).
      if (isRevisionDecision) {
        try {
          const latest = await prisma.manuscript.findFirst({
            where: { submissionId: input.submissionId, isLatest: true },
            orderBy: { uploadedAt: 'desc' },
          })
          if (latest) {
            const filename = latest.minioKey.split('/').pop() ?? 'manuscript.docx'
            // Same folder as the source manuscript — all versions stay together
            const newKey   = MinioStorage.siblingKey(latest.minioKey, filename)
            const buffer   = await minio.download(latest.minioKey)
            await minio.putObject(newKey, buffer)
            await prisma.$transaction([
              prisma.manuscript.updateMany({
                where: { submissionId: input.submissionId, isLatest: true },
                data:  { isLatest: false },
              }),
              prisma.manuscript.create({
                data: {
                  submissionId:  input.submissionId,
                  format:        latest.format,
                  minioPath:     `s3://pubflow-files/${newKey}`,
                  minioKey:      newKey,
                  fileSizeBytes: latest.fileSizeBytes,
                  version:       latest.version + 1,
                  isLatest:      true,
                },
              }),
            ])
          }
        } catch (err) {
          // Snapshot failure must not undo the recorded decision; the author
          // can still revise the current version.
          ctx.prisma && console.error(`[makeDecision] version snapshot failed for ${input.submissionId}:`, err)
        }
      }

      // Orchestrator contract: every transition-performing mutation dispatches
      // stage bots for the target status (was missing here — gap fix).
      await dispatchStageBots(prisma, queues, input.submissionId, nextStatus)

      // Always notify author of the decision
      await queues[QUEUES.NOTIFICATION].add('decision', {
        type: 'NOTIFICATION', to: [], template: 'DECISION_MADE',
        data: { submissionId: input.submissionId, decision: input.decision },
      })

      // Send a focused revision-requested notification for revision decisions
      if (nextStatus === 'REVISION_REQUIRED') {
        await queues[QUEUES.NOTIFICATION].add('revision-requested', {
          type: 'NOTIFICATION', to: [], template: 'REVISION_REQUESTED',
          data: { submissionId: input.submissionId, decision: input.decision },
        })
      }

      return { success: true }
    }),

  getUploadUrl: protectedProcedure
    .input(z.object({
      submissionId: z.string().uuid(),
      filename:     z.string(),
      mimeType:     z.string(),
      size:         z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, minio, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
        include: { publication: { select: { title: true, publisher: { select: { name: true } } } } },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      // Folder tree mirrors the editorial hierarchy: tenant/publisher/journal/submission
      const key = MinioStorage.buildKey(user.tenantId, input.submissionId, input.filename, {
        publisher: sub.publication?.publisher?.name,
        journal:   sub.publication?.title,
      })
      const uploadUrl = await minio.getPresignedUrl(key)

      const fmtMap: Record<string, string> = {
        // Word / Office
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
        'application/msword':                                'DOCX',
        // OpenDocument
        'application/vnd.oasis.opendocument.text':           'ODT',
        // Rich Text
        'application/rtf':                                   'RTF',
        'text/rtf':                                          'RTF',
        // LaTeX
        'application/x-tex':                                 'LATEX',
        'application/x-latex':                               'LATEX',
        'text/x-tex':                                        'LATEX',
        // Markdown / plain text
        'text/markdown':                                     'MARKDOWN',
        'text/x-markdown':                                   'MARKDOWN',
        'text/plain':                                        'MARKDOWN',
        // PDF
        'application/pdf':                                   'PDF',
        // Archive / LaTeX bundle
        'application/zip':                                   'ZIP',
        'application/x-zip-compressed':                      'ZIP',
        'application/x-zip':                                 'ZIP',
        'application/x-7z-compressed':                       'ZIP',
        'application/x-rar-compressed':                      'ZIP',
      }

      await prisma.manuscript.updateMany({
        where: { submissionId: input.submissionId, isLatest: true },
        data:  { isLatest: false },
      })

      const ms = await prisma.manuscript.create({
        data: {
          submissionId:  input.submissionId,
          format:        (fmtMap[input.mimeType] ?? 'DOCX') as ManuscriptFormat,
          minioPath:     `s3://pubflow-files/${key}`,
          minioKey:      key,
          fileSizeBytes: input.size,
          isLatest:      true,
        },
      })

      return { manuscriptId: ms.id, uploadUrl, key }
    }),

  confirmUpload: protectedProcedure
    .input(z.object({
      submissionId: z.string().uuid(),
      manuscriptId: z.string().uuid(),
      minioKey: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, minio, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found' })

      // Verify manuscript exists and belongs to this submission
      const ms = await prisma.manuscript.findFirst({
        where: { id: input.manuscriptId, submissionId: input.submissionId },
      })
      if (!ms) throw new TRPCError({ code: 'NOT_FOUND', message: 'Manuscript not found' })

      // Verify file exists in MinIO
      try {
        const stat = await minio.client.statObject(minio.bucket, input.minioKey)
        if (!stat) throw new Error('File not found in MinIO')
      } catch (err) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'File upload verification failed' })
      }

      // Create an Output record to track normalization result
      const output = await prisma.output.create({
        data: {
          submissionId: input.submissionId,
          format: 'DOCX',
          engine: 'PANDOC',
          minioKey: '',
          status: 'QUEUED',
        },
      })

      // Queue Pandoc normalization job (processor expects a valid outputId)
      await queues[QUEUES.PANDOC].add('normalize-manuscript', {
        type: 'PANDOC',
        submissionId: input.submissionId,
        outputId: output.id,
        inputMinioKey: input.minioKey,
        inputFormat: (ms.format as string).toLowerCase(),
        outputFormat: 'docx', // Normalize to DOCX
        options: { citationStyle: 'apa' },
      })

      return { success: true, manuscriptId: input.manuscriptId, outputId: output.id }
    }),

  createBlankManuscript: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, minio } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
        include: { publication: { select: { title: true, publisher: { select: { name: true } } } } },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found' })

      // Authors can only create for their own DRAFT; editors/admins can create for any
      const isEditorialRole = ['EDITOR_IN_CHIEF', 'SECTION_EDITOR', 'COPY_EDITOR', 'SUPER_ADMIN'].includes(user.role)
      if (!isEditorialRole && (sub.authorId !== user.id || sub.status !== 'DRAFT')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Can only open the editor for your own DRAFT submissions' })
      }

      const docxBuffer = createBlankDocxBuffer()
      const filename   = `manuscript-${Date.now()}.docx`
      const key        = MinioStorage.buildKey(user.tenantId, input.submissionId, filename, {
        publisher: sub.publication?.publisher?.name,
        journal:   sub.publication?.title,
      })

      await minio.putObject(
        key,
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )

      // Retire any previous "latest" version
      await prisma.manuscript.updateMany({
        where: { submissionId: input.submissionId, isLatest: true },
        data:  { isLatest: false },
      })

      const ms = await prisma.manuscript.create({
        data: {
          submissionId:  input.submissionId,
          format:        'DOCX',
          minioPath:     `s3://pubflow-files/${key}`,
          minioKey:      key,
          fileSizeBytes: docxBuffer.length,
          isLatest:      true,
        },
      })

      return { manuscriptId: ms.id }
    }),

  updateDraft: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }).merge(z.object({
      title: z.string().min(10).max(500).optional(),
      abstract: z.string().min(50).max(5000).optional(),
      keywords: z.array(z.string().min(2).max(50)).min(1).max(10).optional(),
      coAuthors: z.array(z.object({
        name: z.string(),
        email: z.string().email(),
        affiliation: z.string().optional(),
        orcid: z.string().optional(),
      })).optional(),
    })))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId, authorId: user.id, status: 'DRAFT' },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found or not in DRAFT status' })

      return prisma.submission.update({
        where: { id: input.id },
        data: {
          title: input.title ?? sub.title,
          abstract: input.abstract ?? sub.abstract,
          keywords: input.keywords ?? sub.keywords,
          coAuthors: (input.coAuthors ?? sub.coAuthors) as any,
        },
      })
    }),

  deleteDraft: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId, authorId: user.id, status: 'DRAFT' },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found or not in DRAFT status' })

      await prisma.submission.delete({ where: { id: input.id } })
      return { success: true }
    }),

  getWorkflowHistory: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.id, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (user.role === 'AUTHOR' && sub.authorId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })

      return prisma.workflowLog.findMany({
        where: { submissionId: input.id },
        include: { submission: { select: { title: true } } },
        orderBy: { createdAt: 'asc' },
      })
    }),

  getManuscriptEditorUrl: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma, minio } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Submission not found' })

      // Authors can only open their own submissions
      if (user.role === 'AUTHOR' && sub.authorId !== user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot access this submission' })
      }

      // Determine whether the user can edit the document at this workflow stage.
      // Read-only access is always granted to see the document.
      const AUTHOR_EDIT_STATUSES    = ['DRAFT', 'REVISION_REQUIRED', 'REVISED']
      const COPY_EDITOR_STATUSES    = ['COPY_EDITING', 'ARTWORK_PROCESSING', 'TYPESETTING', 'PROOF_REVIEW']
      const EDITOR_EDIT_STATUSES    = ['SUBMITTED', 'DESK_REVIEW', 'PEER_REVIEW', 'REVISION_REQUIRED',
                                       'REVISED', 'ACCEPTED', 'COPY_EDITING', 'ARTWORK_PROCESSING',
                                       'TYPESETTING', 'PROOF_REVIEW', 'APPROVED']
      const isAdmin  = user.role === 'SUPER_ADMIN'
      const canEdit  =
        isAdmin ||
        // Whoever owns the submission edits it at author stages, whatever their role
        (sub.authorId === user.id          && AUTHOR_EDIT_STATUSES.includes(sub.status)) ||
        (user.role === 'COPY_EDITOR'       && COPY_EDITOR_STATUSES.includes(sub.status)) ||
        (user.role === 'ARTWORK_EDITOR'    && ['ARTWORK_PROCESSING'].includes(sub.status)) ||
        (user.role === 'TYPESETTER'        && ['TYPESETTING', 'PROOF_REVIEW'].includes(sub.status)) ||
        (['SECTION_EDITOR', 'EDITOR_IN_CHIEF'].includes(user.role) && EDITOR_EDIT_STATUSES.includes(sub.status))

      // Get the latest manuscript
      const manuscript = await prisma.manuscript.findFirst({
        where: { submissionId: input.submissionId, isLatest: true },
        orderBy: { uploadedAt: 'desc' },
      })
      if (!manuscript) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No manuscript uploaded yet' })
      }

      const fileType = FORMAT_TO_FILETYPE[manuscript.format]
      if (!fileType) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `${manuscript.format} files cannot be opened in the browser editor. Use the download button to get the file.`,
        })
      }

      // Generate a presigned URL that OnlyOffice (running in Docker) can fetch.
      // Node.js runs on the Windows host and cannot resolve Docker service names like "minio",
      // so we must set region:'us-east-1' explicitly — without it, minio-js calls
      // getBucketRegionAsync() which makes a real network request to the endPoint hostname,
      // causing getaddrinfo ENOTFOUND when that hostname is a Docker-only DNS name.
      // With region set, minio-js returns it immediately without any network call.
      const ooMinioHost = process.env.ONLYOFFICE_MINIO_HOST ?? process.env.MINIO_ENDPOINT ?? 'localhost'
      const ooMinioClient = new MinioClient({
        endPoint:  ooMinioHost,
        port:      Number(process.env.MINIO_PORT ?? 9000),
        useSSL:    process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY ?? '',
        secretKey: process.env.MINIO_SECRET_KEY ?? '',
        region:    'us-east-1',
      })
      const docUrl = await ooMinioClient.presignedGetObject(minio.bucket, manuscript.minioKey, 3600)

      // OnlyOffice caches documents by key; use manuscript.id so a new upload gets a fresh key.
      const docKey = manuscript.id.replace(/-/g, '')

      // No fallback: a well-known default secret would let anyone forge a
      // valid editor token. If this throws, the API's own startup check
      // (plugins/onlyoffice-check.ts) already logged why it's misconfigured.
      let jwtSecret: string
      try {
        jwtSecret = requireEnv('ONLYOFFICE_JWT_SECRET')
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Document editor is not configured (ONLYOFFICE_JWT_SECRET missing). Contact your administrator.',
        })
      }
      // ONLYOFFICE_CALLBACK_URL should point to the API using a host reachable from inside Docker
      // (e.g. http://host.docker.internal:3001 on Windows/Mac)
      const callbackBase = process.env.ONLYOFFICE_CALLBACK_URL ?? process.env.API_URL ?? 'http://localhost:3001'
      const payload = {
        document: {
          fileType,
          key: docKey,
          title: sub.title || 'Manuscript',
          url: docUrl,
          // permissions live under document, not at the top level — the Document
          // Server ignores a top-level permissions block entirely.
          permissions: {
            comment:  true,
            download: true,
            edit:     canEdit,
            print:    true,
            review:   canEdit,
          },
        },
        editorConfig: {
          callbackUrl: `${callbackBase}/wopi/callback/${input.submissionId}`,
          mode: canEdit ? 'edit' : 'view',
          user: {
            id:    user.id,
            name:  `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            email: user.email,
          },
          customization: {
            autosave:          true,
            forcesave:         false,
            commentAuthorOnly: false,
          },
        },
      }

      // The browser config token is the JWT of the config object itself.
      // (The { payload: ... } wrapper is only for HTTP header tokens on
      // inbox/outbox requests — using it here makes the Document Server
      // reject the config with "security token is not correctly formed".)
      const token = signJwt(payload, jwtSecret)

      return {
        onlyofficeUrl: process.env.ONLYOFFICE_URL || 'http://localhost:8081',
        config:        payload,
        token,
        canEdit,
        format: manuscript.format,
      }
    }),

  getManuscriptDownloadUrl: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma, minio } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (user.role === 'AUTHOR' && sub.authorId !== user.id) throw new TRPCError({ code: 'FORBIDDEN' })

      const manuscript = await prisma.manuscript.findFirst({
        where: { submissionId: input.submissionId, isLatest: true },
        orderBy: { uploadedAt: 'desc' },
      })
      if (!manuscript) throw new TRPCError({ code: 'NOT_FOUND', message: 'No manuscript uploaded yet' })

      // Browser-accessible URL — use the public MinIO endpoint (localhost:9000)
      const url = await minio.client.presignedGetObject(minio.bucket, manuscript.minioKey, 3600)
      return { url, format: manuscript.format, filename: manuscript.minioKey.split('/').pop() ?? 'manuscript' }
    }),

  getManuscriptVersions: protectedProcedure
    .input(z.object({ submissionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { user, prisma } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })

      if (user.role === 'AUTHOR' && sub.authorId !== user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      return prisma.manuscript.findMany({
        where: { submissionId: input.submissionId },
        orderBy: { version: 'desc' },
      })
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const { user, prisma } = ctx
    const where = { tenantId: user.tenantId }

    const groups = await prisma.submission.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    })

    const statusCounts: Record<string, number> = {}
    let total = 0
    for (const g of groups) {
      statusCounts[g.status] = g._count.id
      total += g._count.id
    }

    return { total, statusCounts }
  }),

  advanceStatus: editorProcedure
    .input(z.object({
      submissionId: z.string().uuid(),
      toStatus: SubmissionStatusSchema,
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, prisma, queues } = ctx
      const sub = await prisma.submission.findFirst({
        where: { id: input.submissionId, tenantId: user.tenantId },
      })
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!isValidTransition(sub.status, input.toStatus))
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot transition from ${sub.status} to ${input.toStatus}` })

      const updated = await prisma.submission.update({
        where: { id: input.submissionId },
        data: {
          status: input.toStatus,
          workflowLogs: {
            create: {
              fromStatus: sub.status,
              toStatus: input.toStatus,
              performedBy: user.id,
              note: input.note,
            },
          },
        },
      })

      // Stage bots owning the new status run automatically.
      await dispatchStageBots(prisma, queues, input.submissionId, input.toStatus)

      return updated
    }),
})
