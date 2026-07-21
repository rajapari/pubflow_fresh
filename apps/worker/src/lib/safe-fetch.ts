// ── SSRF-safe outbound fetch ──────────────────────────────
// Used wherever a bot must validate a URL supplied by an author (data/code
// availability links). Rejects non-http(s) schemes and any hostname that
// resolves to a private, loopback, link-local, or other non-public address —
// re-checked on every redirect hop, since redirects are the classic bypass
// (DNS rebinding after the initial check passes).
import dns from 'node:dns/promises'
import net from 'node:net'

const MAX_REDIRECTS = 5
const TIMEOUT_MS = 8000

/** True for RFC1918 / loopback / link-local / CGNAT / reserved IPv4 ranges. */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true // link-local incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast/reserved
  return false
}

/** True for loopback / link-local / unique-local / multicast IPv6 ranges. */
export function isPrivateIPv6(ip: string): boolean {
  const norm = ip.toLowerCase()
  if (norm === '::1') return true
  if (norm === '::') return true
  if (norm.startsWith('fe80:')) return true // link-local
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true // unique-local
  if (norm.startsWith('ff')) return true // multicast
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check the embedded v4 address too.
  const mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])
  return false
}

async function assertPublicHost(hostname: string): Promise<void> {
  // A bare IP literal in the URL — validate directly, no DNS involved.
  if (net.isIP(hostname)) {
    const isPrivate = net.isIP(hostname) === 6 ? isPrivateIPv6(hostname) : isPrivateIPv4(hostname)
    if (isPrivate) throw new Error(`URL resolves to a non-public address: ${hostname}`)
    return
  }
  let records: Array<{ address: string; family: number }>
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch (err) {
    throw new Error(`Could not resolve host: ${hostname} (${String(err)})`)
  }
  if (records.length === 0) throw new Error(`Host resolved to no addresses: ${hostname}`)
  for (const r of records) {
    const isPrivate = r.family === 6 ? isPrivateIPv6(r.address) : isPrivateIPv4(r.address)
    if (isPrivate) throw new Error(`URL resolves to a non-public address: ${hostname} → ${r.address}`)
  }
}

export interface SafeFetchResult {
  ok: boolean
  status: number
  finalUrl: string
}

/**
 * HEAD (falling back to GET) a URL with SSRF guards, re-validated on every
 * redirect hop. Throws with a human-readable reason on any safety violation
 * or network failure; callers should catch and report rather than crash.
 */
export async function safeFetchCheck(rawUrl: string): Promise<SafeFetchResult> {
  let current = new URL(rawUrl)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      throw new Error(`Unsupported URL scheme: ${current.protocol}`)
    }
    await assertPublicHost(current.hostname)

    const attempt = async (method: 'HEAD' | 'GET') =>
      fetch(current, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'PubFlow-ComplianceBot/1.0' },
      })

    let res = await attempt('HEAD')
    // Some repositories (DOI resolvers, Zenodo) reject HEAD; retry with GET.
    if (res.status === 405 || res.status === 501) {
      res = await attempt('GET')
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return { ok: false, status: res.status, finalUrl: current.toString() }
      current = new URL(location, current)
      continue
    }
    return { ok: res.status >= 200 && res.status < 400, status: res.status, finalUrl: current.toString() }
  }
  throw new Error('Too many redirects')
}
