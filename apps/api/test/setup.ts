// Load the monorepo root .env so tests hit the same local services as dev.
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../../../.env') })
