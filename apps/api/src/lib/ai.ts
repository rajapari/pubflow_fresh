// Slim text-only Anthropic client for interactive API endpoints (reviewer
// ranking, decision-letter drafts). Mirrors apps/worker/src/lib/ai.ts minus
// vision; both are dependency-free fetch wrappers.
const API_URL = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1/messages'
const MODEL   = process.env.ANTHROPIC_MODEL    ?? 'claude-sonnet-5'
const VERSION = process.env.ANTHROPIC_VERSION  ?? '2023-06-01'
const TIMEOUT = Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 60_000)

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export async function aiText(
  prompt: string,
  opts: { system?: string; maxTokens?: number } = {},
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('AI unavailable: ANTHROPIC_API_KEY is not set')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: opts.maxTokens ?? 2048,
        temperature: 0,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })
    const json = await res.json() as {
      content?: Array<{ type: string; text?: string }>
      error?: { message: string }
    }
    if (!res.ok || json.error) throw new Error(`AI request failed: ${json.error?.message ?? res.status}`)
    return (json.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text as string)
      .join('')
      .trim()
  } finally {
    clearTimeout(timer)
  }
}
