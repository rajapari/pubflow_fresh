import { Worker, Queue } from 'bullmq'
import { QUEUES } from '@pubflow/types'
import { initSentry, sentryEnabled, captureException } from './lib/sentry.js'
import { pandocProcessor }       from './processors/pandoc.js'
import { latexProcessor }        from './processors/latex.js'
import { scribusProcessor }      from './processors/scribus.js'
import { imageProcessor }        from './processors/image.js'
import { notificationProcessor } from './processors/notification.js'
import { schedulerProcessor }    from './processors/scheduler.js'
import { intakeProcessor }       from './processors/intake.js'
import { copyeditProcessor }     from './processors/copyedit.js'
import { templateProcessor }     from './processors/template.js'
import { correctionProcessor }   from './processors/correction.js'
import { revisionProcessor }     from './processors/revision.js'
import { preflightProcessor }    from './processors/preflight.js'
import { xmlvalidateProcessor }  from './processors/xmlvalidate.js'
import { issueProcessor }        from './processors/issue.js'
import { editorialProcessor }    from './processors/editorial.js'
import { marketingProcessor }    from './processors/marketing.js'
import { complianceProcessor }   from './processors/compliance.js'
import { ensureBucket }          from './lib/storage.js'

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

initSentry()
process.on('uncaughtException', (err) => { captureException(err, { source: 'uncaughtException' }) })
process.on('unhandledRejection', (err) => { captureException(err, { source: 'unhandledRejection' }) })

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

// Must resolve before any worker starts picking up jobs — a job landing
// mid-race against bucket creation is a NoSuchBucket failure, not a retry.
await ensureBucket()
console.info('✅ MinIO: bucket ready')

const workers = [
  new Worker(QUEUES.PANDOC,       pandocProcessor,       { ...workerOpts, concurrency: 5 }),
  new Worker(QUEUES.LATEX,        latexProcessor,        { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.SCRIBUS,      scribusProcessor,      { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.IMAGE,        imageProcessor,        { ...workerOpts, concurrency: 8 }),
  new Worker(QUEUES.NOTIFICATION, notificationProcessor, { ...workerOpts, concurrency: 10 }),
  new Worker(QUEUES.SCHEDULER,    schedulerProcessor,    { ...workerOpts, concurrency: 1 }),
  new Worker(QUEUES.INTAKE,       intakeProcessor,       { ...workerOpts, concurrency: 3 }),
  new Worker(QUEUES.COPYEDIT,     copyeditProcessor,     { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.TEMPLATE,     templateProcessor,     { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.CORRECTION,   correctionProcessor,   { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.REVISION,     revisionProcessor,     { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.PREFLIGHT,    preflightProcessor,    { ...workerOpts, concurrency: 3 }),
  new Worker(QUEUES.XMLVALIDATE,  xmlvalidateProcessor,  { ...workerOpts, concurrency: 3 }),
  new Worker(QUEUES.ISSUE,        issueProcessor,        { ...workerOpts, concurrency: 1 }),
  new Worker(QUEUES.EDITORIAL,    editorialProcessor,    { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.MARKETING,    marketingProcessor,    { ...workerOpts, concurrency: 2 }),
  new Worker(QUEUES.COMPLIANCE,   complianceProcessor,   { ...workerOpts, concurrency: 3 }),
]

// Register the daily review-reminder cron job.
// Uses upsert semantics so restarting the worker never creates duplicate schedules.
const schedulerQueue = new Queue(QUEUES.SCHEDULER, { connection })
schedulerQueue
  .add(
    'review-reminder-daily',
    { type: 'REVIEW_REMINDER_CHECK' },
    {
      repeat:           { pattern: '0 8 * * *' }, // 08:00 UTC every day
      removeOnComplete: { count: 1 },
      removeOnFail:     { count: 5 },
      jobId:            'review-reminder-daily',   // idempotent — won't add duplicates
    }
  )
  .then(() => console.info('✅ Scheduler: daily review-reminder cron registered (08:00 UTC)'))
  .catch((err: Error) => console.error('⚠️  Scheduler: failed to register cron job:', err.message))

workers.forEach((w) => {
  w.on('completed', (job) =>
    console.info(`✅ [${w.name}] Job ${job.id} completed`)
  )
  w.on('failed', (job, err) => {
    console.error(`❌ [${w.name}] Job ${job?.id} failed: ${err.message}`)
    // Only report once retries are exhausted — a transient failure BullMQ
    // will retry isn't an incident yet.
    if ((job?.attemptsMade ?? 0) >= (job?.opts.attempts ?? 1)) {
      captureException(err, { queue: w.name, jobId: job?.id, jobData: job?.data })
    }
  })
  w.on('error', (err) => {
    console.error(`⚠️  [${w.name}] Worker error: ${err.message}`)
    captureException(err, { queue: w.name, source: 'worker-error' })
  })
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
console.info(sentryEnabled() ? '✅ Sentry error tracking enabled' : 'ℹ️  Sentry disabled (SENTRY_DSN not set)')
