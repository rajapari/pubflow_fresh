import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { createHmac, timingSafeEqual } from 'crypto'
import type { AuthUser } from '@pubflow/types'
import { prisma } from '../lib/prisma.js'
import { requireEnv } from '../lib/env.js'
import { canAccessManuscript } from '../lib/submission-access.js'

function verifyJwt(token: string, secret: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const expected = createHmac('sha256', secret)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url')
    return timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))
  } catch {
    return false
  }
}

export const wopiRoutes = fp(async (app: FastifyInstance) => {
  // Raw body parser for OnlyOffice PutFile (sends binary, not multipart)
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body)
  })

  // NOTE: these three /wopi/files/* endpoints implement the WOPI protocol
  // (CheckFileInfo/GetFile/PutFile) but are not on the live editor path —
  // apps/api/src/routers/submission.ts's getManuscriptEditorUrl feeds
  // OnlyOffice a presigned MinIO URL directly instead. They're kept for the
  // documented WOPI integration (PUBFLOW_AGENT_SPEC.md) and secured the same
  // way as every other manuscript-access path in the app: authenticate the
  // caller, then apply canAccessManuscript (author, assigned staff, or the
  // reviewer actually assigned — never an anonymous caller or an unrelated
  // tenant). The :key path segments are used for routing only; authorization
  // is always derived from the authenticated session + DB state, never from
  // the (client-controlled) URL.

  /**
   * GET /wopi/files/:key — CheckFileInfo
   */
  app.get<{ Params: { key: string } }>(
    '/wopi/files/:key',
    async (req: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      try {
        await app.authenticate(req)
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      const authUser = req.user as unknown as AuthUser

      const parts = (req.params as { key: string }).key.split('/')
      if (parts.length < 4) return reply.code(404).send({ error: 'Invalid key format' })

      const [, , manuscriptId, ...rest] = parts
      const filename = rest.join('/')

      try {
        const manuscript = await prisma.manuscript.findUnique({
          where: { id: manuscriptId },
          include: { submission: true },
        })
        if (!manuscript || manuscript.submission.tenantId !== authUser.tenantId) {
          return reply.code(404).send({ error: 'Not found' })
        }
        if (!(await canAccessManuscript(prisma, authUser, manuscript.submission))) {
          return reply.code(404).send({ error: 'Not found' })
        }

        return {
          BaseFileName:     filename,
          Size:             manuscript.fileSizeBytes,
          Version:          manuscript.version.toString(),
          OwnerId:          manuscript.submission.authorId,
          LastModifiedTime: manuscript.uploadedAt.toISOString(),
          UserCanWrite:     true,
          UserCanRename:    false,
          IsEditable:       true,
          SupportsUpdate:   true,
          SupportsLocks:    false,
          SupportsGetLock:  false,
          SupportsSetLock:  false,
          SupportsDelete:   false,
        }
      } catch (err) {
        app.log.error(err)
        return reply.code(500).send({ error: 'Server error' })
      }
    }
  )

  /**
   * GET /wopi/files/:key/contents — GetFile
   */
  app.get<{ Params: { key: string } }>(
    '/wopi/files/:key/contents',
    async (req: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      try {
        await app.authenticate(req)
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      const authUser = req.user as unknown as AuthUser

      const parts = (req.params as { key: string }).key.split('/')
      const manuscriptId = parts[2]

      try {
        const manuscript = await prisma.manuscript.findUnique({
          where: { id: manuscriptId },
          include: { submission: true },
        })
        if (!manuscript || manuscript.submission.tenantId !== authUser.tenantId) {
          return reply.code(404).send({ error: 'Not found' })
        }
        if (!(await canAccessManuscript(prisma, authUser, manuscript.submission))) {
          return reply.code(404).send({ error: 'Not found' })
        }

        const stream = await app.minio.getFileStream(manuscript.minioKey)
        reply.type('application/octet-stream')
        reply.header('Content-Disposition', `attachment; filename="${manuscript.minioKey.split('/').pop()}"`)
        return reply.send(stream)
      } catch (err) {
        app.log.error(err)
        return reply.code(500).send({ error: 'Server error' })
      }
    }
  )

  /**
   * POST /wopi/files/:key/contents — PutFile (WOPI write-back)
   */
  app.post<{ Params: { key: string } }>(
    '/wopi/files/:key/contents',
    async (req: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      try {
        await app.authenticate(req)
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      const authUser = req.user as unknown as AuthUser

      const parts = (req.params as { key: string }).key.split('/')
      // The path's submissionId is caller-supplied and untrusted — writes
      // always target the manuscript's REAL owning submission (below), never
      // this value, so a forged submissionId can't attach content elsewhere.
      const manuscriptId = parts[2]

      try {
        const manuscript = await prisma.manuscript.findUnique({
          where: { id: manuscriptId },
          include: { submission: true },
        })
        if (!manuscript || manuscript.submission.tenantId !== authUser.tenantId) {
          return reply.code(404).send({ error: 'Not found' })
        }
        // Writing is narrower than read access: the author or production/
        // editorial staff only — never an assigned peer reviewer or a reader.
        const canWrite =
          manuscript.submission.authorId === authUser.id ||
          ['EDITOR_IN_CHIEF', 'SECTION_EDITOR', 'COPY_EDITOR', 'ARTWORK_EDITOR', 'TYPESETTER', 'SUPER_ADMIN']
            .includes(authUser.role)
        if (!canWrite) return reply.code(403).send({ error: 'Forbidden' })

        const submissionId = manuscript.submissionId
        const fileBuffer = req.body as Buffer
        const newVersion = manuscript.version + 1
        const newKey     = `${manuscript.minioKey}-v${newVersion}`

        await app.minio.putObject(newKey, fileBuffer)

        await prisma.$transaction([
          prisma.manuscript.updateMany({ where: { submissionId, isLatest: true }, data: { isLatest: false } }),
          prisma.manuscript.create({
            data: {
              submissionId,
              format:        manuscript.format,
              minioPath:     `s3://pubflow-files/${newKey}`,
              minioKey:      newKey,
              fileSizeBytes: fileBuffer.length,
              version:       newVersion,
              isLatest:      true,
            },
          }),
        ])

        return reply.send({ ItemVersion: newVersion.toString() })
      } catch (err) {
        app.log.error(err)
        return reply.code(500).send({ error: 'Server error' })
      }
    }
  )

  /**
   * POST /wopi/callback/:submissionId — OnlyOffice Document Server callback
   *
   * Called by OnlyOffice when:
   *   status 2 = document saved (all editors closed with changes)
   *   status 6 = forced save completed
   *
   * Always responds { error: 0 } to avoid OnlyOffice retry loops.
   */
  app.post<{ Params: { submissionId: string } }>(
    '/wopi/callback/:submissionId',
    async (req, reply) => {
      const { submissionId } = req.params as { submissionId: string }

      // Verify OnlyOffice JWT. The Document Server sends it in the header
      // configured by JWT_HEADER (AuthorizationJwt — renamed so MinIO
      // presigned downloads don't see two auth mechanisms at once).
      // The header — and its verification — are ALWAYS required, not merely
      // checked when present: an attacker who simply omits the header used to
      // skip verification entirely and overwrite any manuscript unchallenged.
      const authHeader = (req.headers['authorizationjwt'] ?? req.headers['authorization']) as string | undefined
      // No fallback secret: falling back to a well-known default would let
      // anyone forge a callback that overwrites a manuscript. If the secret
      // isn't configured we cannot verify authenticity, so fail closed.
      let jwtSecret: string
      try {
        jwtSecret = requireEnv('ONLYOFFICE_JWT_SECRET')
      } catch {
        app.log.error({ submissionId }, 'OnlyOffice callback: ONLYOFFICE_JWT_SECRET not configured — rejecting unverifiable request')
        return reply.code(500).send({ error: 1 })
      }
      if (!authHeader) {
        app.log.warn({ submissionId }, 'OnlyOffice callback: missing signature header')
        return reply.code(403).send({ error: 1 })
      }
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
      if (!verifyJwt(token, jwtSecret)) {
        app.log.warn({ submissionId }, 'OnlyOffice callback JWT verification failed')
        return reply.code(403).send({ error: 1 })
      }

      const body = req.body as {
        status: number
        url?: string
        key?: string
        users?: string[]
        notmodified?: boolean
      }

      app.log.info({ submissionId, status: body.status }, 'OnlyOffice callback received')

      // status 2 = ready to save; status 6 = forced save
      if ((body.status === 2 || body.status === 6) && body.url) {
        try {
          // Rewrite the OnlyOffice-internal URL to use the externally accessible URL
          // so the API (running on host) can fetch the saved document.
          const ooExternalUrl = process.env.ONLYOFFICE_URL ?? 'http://localhost:8081'
          const saved  = new URL(body.url)
          const extern = new URL(ooExternalUrl)
          saved.hostname = extern.hostname
          saved.port     = extern.port
          saved.protocol = extern.protocol

          const res = await fetch(saved.toString())
          if (!res.ok) throw new Error(`Failed to fetch saved document from OnlyOffice: ${res.status}`)

          const fileBuffer = Buffer.from(await res.arrayBuffer())

          const manuscript = await prisma.manuscript.findFirst({
            where: { submissionId, isLatest: true },
            orderBy: { uploadedAt: 'desc' },
          })

          if (!manuscript) {
            app.log.warn({ submissionId }, 'Callback: no manuscript found, skipping save')
            return reply.send({ error: 0 })
          }

          // Overwrite the existing MinIO object in-place (same key, same cache slot)
          const mime: Record<string, string> = {
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            odt:  'application/vnd.oasis.opendocument.text',
            rtf:  'application/rtf',
            txt:  'text/plain',
            pdf:  'application/pdf',
          }
          const ext = manuscript.minioKey.split('.').pop() ?? 'docx'
          await app.minio.putObject(manuscript.minioKey, fileBuffer, mime[ext] ?? 'application/octet-stream')

          await prisma.manuscript.update({
            where: { id: manuscript.id },
            data: { fileSizeBytes: fileBuffer.length },
          })

          app.log.info({ submissionId, bytes: fileBuffer.length }, 'OnlyOffice save persisted to MinIO')
        } catch (err) {
          app.log.error({ err, submissionId }, 'OnlyOffice callback: failed to persist save')
          // Still return {error:0} — returning an error causes OnlyOffice to retry endlessly
        }
      }

      return reply.send({ error: 0 })
    }
  )

  app.log.info('✅ WOPI routes ready')
}, { name: 'wopi' })
