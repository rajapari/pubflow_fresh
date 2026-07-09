// Shared BullMQ Redis connection config, parsed from REDIS_URL.
export function getConnection() {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379/0'
  try {
    const p = new URL(url)
    return {
      host:     p.hostname || 'localhost',
      port:     Number(p.port) || 6379,
      password: p.password || undefined,
      db:       Number(p.pathname?.replace('/', '') || 0),
      maxRetriesPerRequest: null as null,
      enableReadyCheck: false,
    }
  } catch {
    return { host: 'localhost', port: 6379, password: undefined, db: 0,
             maxRetriesPerRequest: null as null, enableReadyCheck: false }
  }
}
