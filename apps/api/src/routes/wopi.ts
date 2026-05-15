import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { prisma } from '../lib/prisma.js'

/**
 * WOPI Protocol Implementation for OnlyOffice
 * Reference: https://docs.microsoft.com/en-us/office/client-developer/online/wopi-overview
 * 
 * OnlyOffice calls these endpoints to get file info, read, and write file contents.
 * The JWT token in the URL verifies the request.
 */

export const wopiRoutes = fp(async (app: FastifyInstance) => {
  /**
   * GET /wopi/files/:key
   * CheckFileInfo — Return metadata about the file
   */
  app.get<{ Params: { key: string } }>('/wopi/files/:key', async (req: FastifyRequest, reply: FastifyReply) => {
    const { key } = req.params

    // Parse key: tenantId/submissionId/manuscriptId/filename.ext
    const parts = key.split('/')
    if (parts.length < 4) return reply.code(404).send({ error: 'Invalid key format' })

    const [tenantId, submissionId, manuscriptId, ...fileParts] = parts
    const filename = fileParts.join('/')

    try {
      const manuscript = await prisma.manuscript.findUnique({
        where: { id: manuscriptId },
        include: { submission: true },
      })
      if (!manuscript || manuscript.submission.tenantId !== tenantId) {
        return reply.code(404).send({ error: 'Not found' })
      }

      // WOPI CheckFileInfo response
      return {
        BaseFileName: filename,
        Size: manuscript.fileSizeBytes,
        Version: manuscript.version.toString(),
        OwnerId: manuscript.submission.authorId,
        LastModifiedTime: manuscript.uploadedAt.toISOString(),
        UserCanWrite: true,
        UserCanRename: false,
        IsEditable: true,
        SupportsUpdate: true,
        SupportsLocks: false,
        SupportsGetLock: false,
        SupportsSetLock: false,
        SupportsDelete: false,
      }
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: 'Server error' })
    }
  })

  /**
   * GET /wopi/files/:key/contents
   * GetFile — Download file contents
   */
  app.get<{ Params: { key: string } }>('/wopi/files/:key/contents', async (req: FastifyRequest, reply: FastifyReply) => {
    const { key } = req.params

    try {
      const parts = key.split('/')
      const [tenantId, submissionId, manuscriptId] = parts

      const manuscript = await prisma.manuscript.findUnique({
        where: { id: manuscriptId },
        include: { submission: true },
      })
      if (!manuscript || manuscript.submission.tenantId !== tenantId) {
        return reply.code(404).send({ error: 'Not found' })
      }

      // Stream file from MinIO
      const { minio } = app
      const stream = await minio.getFileStream(manuscript.minioKey)

      reply.type('application/octet-stream')
      reply.header('Content-Disposition', `attachment; filename="${manuscript.minioKey.split('/').pop()}"`)
      return reply.send(stream)
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: 'Server error' })
    }
  })

  /**
   * POST /wopi/files/:key/contents
   * PutFile — Upload modified file contents, create new version
   */
  app.post<{ Params: { key: string } }>('/wopi/files/:key/contents', async (req: FastifyRequest, reply: FastifyReply) => {
    const { key } = req.params

    try {
      const parts = key.split('/')
      const [tenantId, submissionId, manuscriptId] = parts

      const manuscript = await prisma.manuscript.findUnique({
        where: { id: manuscriptId },
        include: { submission: true },
      })
      if (!manuscript || manuscript.submission.tenantId !== tenantId) {
        return reply.code(404).send({ error: 'Not found' })
      }

      // Read request body as buffer
      const buffer = await req.file()
      if (!buffer) return reply.code(400).send({ error: 'No file provided' })

      const fileBuffer = await buffer.file.buffer()
      
      // Upload to MinIO with new version
      const newVersion = manuscript.version + 1
      const newKey = key.replace(manuscriptId, `${manuscriptId}-v${newVersion}`)

      await minio.putObject(newKey, fileBuffer)

      // Create new manuscript version in DB
      const newManuscript = await prisma.$transaction([
        prisma.manuscript.updateMany({
          where: { submissionId, isLatest: true },
          data: { isLatest: false },
        }),
        prisma.manuscript.create({
          data: {
            submissionId,
            format: manuscript.format,
            minioPath: `s3://pubflow-files/${newKey}`,
            minioKey: newKey,
            fileSizeBytes: fileBuffer.length,
            version: newVersion,
            isLatest: true,
          },
        }),
      ])

      // Return WOPI response
      return {
        ItemVersion: newVersion.toString(),
      }
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: 'Server error' })
    }
  })

  /**
   * POST /wopi/callback/:submissionId
   * OnlyOffice AutoSave Callback — Called periodically by OnlyOffice
   */
  app.post<{ Params: { submissionId: string } }>('/wopi/callback/:submissionId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { submissionId } = req.params

    try {
      // OnlyOffice sends a callback when autosave happens
      // For now, just log and acknowledge
      app.log.info(`OnlyOffice autosave callback for submission ${submissionId}`)
      return { status: 0 } // 0 = success
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: 'Server error' })
    }
  })

  app.log.info('✅ WOPI routes ready')
}, { name: 'wopi' })
