import { Worker } from 'bullmq'
import { QUEUES } from '@pubflow/types'
import { pandocProcessor }       from './processors/pandoc.js'
import { latexProcessor }        from './processors/latex.js'
import { scribusProcessor }      from './processors/scribus.js'
import { imageProcessor }        from './processors/image.js'
import { notificationProcessor } from './processors/notification.js'

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url)
    return {
      host:     parsed.hostname || 'localhost',
      port:     Number(parsed.port) || 6379,
      password: parsed.password || undefined,
      db:       Number(parsed.pathname?.replace('/', '') || 0),
    }
  } catch {
    return { host: 'localhost', port: 6379, password: undefined, db: 0 }
  }
}

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/0'
const redisConfig = parseRedisUrl(redisUrl)

console.info(`Worker Redis config: ${redisConfig.host}:${redisConfig.port}`)

const connection = {
  ...redisConfig,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
}

const workerOpts = {
  connection,
  concurrency: 3,
  removeOnComplete: { count: 100 },
  removeOnFail:     { count: 500 },
}

const workers = [
  new Worker(QUEUES.PANDOC,       pandocProcessor,       { ...workerOpts, concurrency: 5 }),
  new Worker(QUEUES.LATEX,        latexProcessor,        { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.SCRIBUS,      scribusProcessor,      { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.IMAGE,        imageProcessor,        { ...workerOpts, concurrency: 8 }),
  new Worker(QUEUES.NOTIFICATION, notificationProcessor, { ...workerOpts, concurrency: 10 }),
]

workers.forEach((w) => {
  w.on('completed', (job) =>
    console.info(`✅ [${w.name}] Job ${job.id} completed`)
  )
  w.on('failed', (job, err) =>
    console.error(`❌ [${w.name}] Job ${job?.id} failed: ${err.message}`)
  )
  w.on('error', (err) =>
    console.error(`⚠️  [${w.name}] Worker error: ${err.message}`)
  )
})

async function shutdown() {
  console.info('Shutting down workers gracefully...')
  await Promise.all(workers.map((w) => w.close()))
  console.info('All workers stopped.')
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT',  shutdown)

console.info('🚀 PubFlow workers started')
console.info(`   Queues: ${Object.values(QUEUES).join(', ')}`)
