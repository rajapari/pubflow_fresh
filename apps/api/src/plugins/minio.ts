import fp from 'fastify-plugin'
import { Client as MinioClient } from 'minio'
import type { FastifyInstance } from 'fastify'
import { createHash } from 'crypto'

declare module 'fastify' {
  interface FastifyInstance {
    minio: MinioStorage
  }
}

export class MinioStorage {
  client: MinioClient
  bucket: string

  constructor() {
    const endpoint  = process.env.MINIO_ENDPOINT ?? 'localhost'
    const port      = Number(process.env.MINIO_PORT ?? 9000)
    const accessKey = process.env.MINIO_ACCESS_KEY ?? ''
    const secretKey = process.env.MINIO_SECRET_KEY ?? ''
    const useSSL    = process.env.MINIO_USE_SSL === 'true'

    if (!accessKey || !secretKey) {
      throw new Error(
        'MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set in .env file.\n' +
        `Current values: accessKey="${accessKey}", secretKey="${secretKey ? '***' : '(empty)'}"`
      )
    }

    this.client = new MinioClient({ endPoint: endpoint, port, useSSL, accessKey, secretKey })
    this.bucket = process.env.MINIO_BUCKET ?? 'pubflow-files'

    console.info(`MinIO config: ${endpoint}:${port} bucket="${this.bucket}" user="${accessKey}"`)
  }

  async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket)
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1')
        console.info(`✅ MinIO: bucket '${this.bucket}' created`)
      } else {
        console.info(`✅ MinIO: bucket '${this.bucket}' ready`)
      }
      // Allow anonymous GET for the public/ prefix (static article HTML pages)
      const policy = JSON.stringify({
        Version:   '2012-10-17',
        Statement: [{
          Effect:    'Allow',
          Principal: { AWS: ['*'] },
          Action:    ['s3:GetObject'],
          Resource:  [`arn:aws:s3:::${this.bucket}/public/*`],
        }],
      })
      await this.client.setBucketPolicy(this.bucket, policy)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `MinIO connection failed: ${msg}\n` +
        `Check that MinIO is running: docker ps | grep minio\n` +
        `And that credentials match docker-compose.yml`
      )
    }
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
    })
    return key
  }

  async download(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key)
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  async getPresignedUrl(key: string, expiry = 900): Promise<string> {
    // Default to a PUT presigned URL for uploads (used by submission upload flow).
    // Use method override when needed in future.
    return this.client.presignedPutObject(this.bucket, key, expiry)
  }

  async statObject(key: string) {
    return this.client.statObject(this.bucket, key)
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key)
  }

  async getFileStream(key: string): Promise<NodeJS.ReadableStream> {
    return this.client.getObject(this.bucket, key)
  }

  async putObject(key: string, buffer: Buffer, mimeType = 'application/octet-stream'): Promise<void> {
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
    })
  }

  /** Filesystem-safe slug for folder names derived from publisher/journal titles. */
  static slug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\x20-\x7e]/g, '')   // strip accents/non-ASCII after NFKD
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  }

  /**
   * Object key for submission files. When publisher/journal metadata is
   * available the folder tree mirrors the editorial hierarchy:
   *   {tenantId}/{publisher}/{journal}/{submissionId}/{hash}.{ext}
   * Legacy fallback (no metadata): {tenantId}/{submissionId}/{hash}.{ext}
   */
  static buildKey(
    tenantId: string,
    submissionId: string,
    filename: string,
    meta?: { publisher?: string | null; journal?: string | null; subfolder?: string },
  ): string {
    const ext  = filename.split('.').pop() ?? 'bin'
    const hash = createHash('sha256')
      .update(`${tenantId}:${submissionId}:${filename}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16)
    const leaf = meta?.subfolder ? `${meta.subfolder}/${hash}.${ext}` : `${hash}.${ext}`
    if (meta?.journal) {
      const publisher = MinioStorage.slug(meta.publisher ?? 'independent')
      return `${tenantId}/${publisher}/${MinioStorage.slug(meta.journal)}/${submissionId}/${leaf}`
    }
    return `${tenantId}/${submissionId}/${leaf}`
  }

  /** New object key in the SAME folder as an existing one (version snapshots,
   *  corrected copies) so all files of a submission stay physically together. */
  static siblingKey(existingKey: string, filename: string): string {
    const dir  = existingKey.includes('/') ? existingKey.slice(0, existingKey.lastIndexOf('/')) : ''
    const ext  = filename.split('.').pop() ?? 'bin'
    const hash = createHash('sha256')
      .update(`${existingKey}:${filename}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16)
    return dir ? `${dir}/${hash}.${ext}` : `${hash}.${ext}`
  }
}

export const minioPlugin = fp(async (app: FastifyInstance) => {
  const storage = new MinioStorage()
  await storage.ensureBucket()
  app.decorate('minio', storage)
  app.log.info('✅ MinIO storage ready')
})
