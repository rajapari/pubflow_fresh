// ── Copyleaks client ──────────────────────────────────────
// Thin fetch wrapper for the similarity/plagiarism-check provider. Two-step
// auth: email + API key -> a 48h bearer token (cached in-process so we don't
// re-login on every scan), then a scan is submitted by PUTting the
// manuscript to a caller-chosen scanId. Results are NOT in this response —
// Copyleaks calls back asynchronously to the webhook URL we supply (see
// apps/api/src/routes/webhooks.ts), often minutes later once the scan
// finishes crawling/indexing.
const IDENTITY_URL = process.env.COPYLEAKS_IDENTITY_URL ?? 'https://id.copyleaks.com'
const API_URL       = process.env.COPYLEAKS_API_URL     ?? 'https://api.copyleaks.com'

export function copyleaksEnabled(): boolean {
  return Boolean(process.env.COPYLEAKS_API_KEY && process.env.COPYLEAKS_EMAIL)
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function login(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token

  const email = process.env.COPYLEAKS_EMAIL
  const key   = process.env.COPYLEAKS_API_KEY
  if (!email || !key) throw new Error('Copyleaks not configured: set COPYLEAKS_EMAIL and COPYLEAKS_API_KEY')

  const res = await fetch(`${IDENTITY_URL}/v3/account/login/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, key }),
  })
  if (!res.ok) throw new Error(`Copyleaks login failed: HTTP ${res.status} ${await res.text()}`)
  const json = await res.json() as { access_token: string }

  // Token is valid 48h server-side; refresh an hour early so a long-running
  // process never hands out a token that expires mid-flight.
  cachedToken = { token: json.access_token, expiresAt: Date.now() + 47 * 60 * 60 * 1000 }
  return cachedToken.token
}

// Copyleaks determines document type from the filename extension — no need
// to pre-convert through Pandoc, it parses DOCX/PDF/ODT/etc. natively.
const FORMAT_EXT: Record<string, string> = {
  DOCX: 'docx', LATEX: 'tex', MARKDOWN: 'md', ODT: 'odt', RTF: 'rtf', PDF: 'pdf',
}

export async function submitScan(params: {
  scanId: string
  content: Buffer
  format: string
  /** Full URL Copyleaks should POST to on completion, MINUS the trailing
   *  /{STATUS} segment — Copyleaks appends the literal status word itself. */
  webhookBaseUrl: string
}): Promise<void> {
  const token = await login()
  const ext = FORMAT_EXT[params.format] ?? 'txt'

  const res = await fetch(`${API_URL}/v3/scans/submit/file/${encodeURIComponent(params.scanId)}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      base64: params.content.toString('base64'),
      filename: `manuscript.${ext}`,
      properties: {
        webhooks: { status: `${params.webhookBaseUrl}/{STATUS}` },
        // Sandbox mode returns synthetic results without consuming real
        // credits or actually indexing/crawling — set COPYLEAKS_SANDBOX=true
        // to verify the integration end-to-end before relying on it for
        // real submissions.
        sandbox: process.env.COPYLEAKS_SANDBOX === 'true',
      },
    }),
  })
  if (!res.ok) throw new Error(`Copyleaks submit failed: HTTP ${res.status} ${await res.text()}`)
}
