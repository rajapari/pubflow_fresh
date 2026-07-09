// Load the monorepo root .env so tests hit the same local services
// (Postgres, Redis, MinIO, LanguageTool) as `pnpm dev`.
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../../../.env') })

// Fresh MinIO (CI, or any first-time checkout) has no bucket until
// something creates it — normally the API's own boot does this, but tests
// never boot the API. Without this, every MinIO-touching test fails with
// S3Error: The specified bucket does not exist.
const { ensureBucket } = await import('../src/lib/storage.js')
await ensureBucket()
