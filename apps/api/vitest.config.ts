import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // These are integration tests against real, shared infrastructure (one
    // Redis instance, fixed BullMQ queue names, one Postgres DB) — running
    // test files concurrently (vitest's default even with singleFork: true,
    // which only pins them to one process) lets two files race on the same
    // physical queue: one file's getJobs()/remove() can observe or delete
    // jobs another file just enqueued, occasionally surfacing as
    // "Cannot read properties of undefined (reading 'data')". Run files
    // strictly one at a time instead.
    fileParallelism: false,
  },
})
