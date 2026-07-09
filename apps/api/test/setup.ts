// Load the monorepo root .env so tests hit the same local services as dev.
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../../../.env') })

// Fresh MinIO (CI, or any first-time checkout) has no bucket until
// something creates it — normally minioPlugin does this on server boot,
// but tests never boot the Fastify server (createCaller bypasses it).
// Without this, every MinIO-touching test fails with S3Error: The
// specified bucket does not exist.
const { MinioStorage } = await import('../src/plugins/minio.js')
await new MinioStorage().ensureBucket()
