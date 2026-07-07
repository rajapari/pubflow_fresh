/**
 * Reads a required environment variable, or throws immediately with an
 * actionable message.
 *
 * Use this for any secret or credential instead of `process.env.X ?? 'fallback'`.
 * A silent fallback to a well-known default (a password or JWT secret typed
 * into source code) is a security hole that is invisible until someone
 * forgets to set the real value in a new environment — the app keeps working,
 * just insecurely. Failing loudly here turns that into an immediate, obvious
 * error instead of a silent vulnerability.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. There is no safe default for ` +
      `this value — set it in the environment before this code path runs.`
    )
  }
  return value
}
