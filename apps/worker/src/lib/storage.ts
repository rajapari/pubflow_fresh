import { Client as MinioClient } from 'minio'

const client = new MinioClient({
  endPoint:  process.env.MINIO_ENDPOINT ?? 'minio',
  port:      Number(process.env.MINIO_PORT ?? 9000),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? '',
  secretKey: process.env.MINIO_SECRET_KEY ?? '',
})
const BUCKET = process.env.MINIO_BUCKET ?? 'pubflow-files'

export async function downloadFromMinio(key: string): Promise<Buffer> {
  const stream = await client.getObject(BUCKET, key)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export async function uploadToMinio(key: string, buffer: Buffer, mimeType: string) {
  await client.putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': mimeType })
}
