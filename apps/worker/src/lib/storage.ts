import { Client as MinioClient } from 'minio'

const client = new MinioClient({
  endPoint:  process.env.MINIO_ENDPOINT ?? 'minio',
  port:      Number(process.env.MINIO_PORT ?? 9000),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? '',
  secretKey: process.env.MINIO_SECRET_KEY ?? '',
})
const BUCKET = process.env.MINIO_BUCKET ?? 'pubflow-files'

// Idempotent — safe to call on every worker boot. The API's own bootstrap
// (apps/api/src/plugins/minio.ts) creates this bucket too, but nothing
// guarantees the API starts before the worker (independent processes,
// independent k8s replicas), so relying on that ordering is a latent
// NoSuchBucket bug waiting for a fresh deployment where the worker wins the
// race. Also called from apps/worker/test/setup.ts so tests are self-
// sufficient against a fresh MinIO (this is what CI hits).
export async function ensureBucket(): Promise<void> {
  const exists = await client.bucketExists(BUCKET)
  if (!exists) {
    try {
      await client.makeBucket(BUCKET, 'us-east-1')
    } catch (err) {
      // exists-check → create is racy when several processes boot at once
      // (CI runs worker+api suites in parallel); losing that race is success.
      const code = (err as { code?: string }).code
      if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw err
    }
  }
}

export async function downloadFromMinio(key: string): Promise<Buffer> {
  const stream = await client.getObject(BUCKET, key)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export async function uploadToMinio(key: string, buffer: Buffer, mimeType: string) {
  await client.putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': mimeType })
}
