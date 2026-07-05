import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // DB-touching tests share fixtures; keep them in one worker to avoid races.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
