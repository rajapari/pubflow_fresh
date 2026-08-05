// Slim text-only Anthropic client for interactive API endpoints (reviewer
// ranking, decision-letter drafts). Mirrors apps/worker/src/lib/ai.ts minus
// vision; both are dependency-free fetch wrappers.
const API_URL = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1/messages'
const MODEL   = process.env.ANTHROPIC_MODEL    ?? 'claude-sonnet-5'
const VERSION = process.env.ANTHROPIC_VERSION  ?? '2023-06-01'
const TIMEOUT = Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 60_000)

// Two separate console.anthropic.com API keys ("pubflow-dev-worker" /
// "pubflow-prod-worker") so dev usage/spend never shares a budget or rate
// limit with production. Selected by NODE_ENV, read fresh on every call
// (not cached at module load) so tests can flip it at runtime.
function resolveApiKey(): string | undefined {
  return process.env.NODE_ENV === 'production'
    ? process.env.ANTHROPIC_API_KEY_PROD
    : process.env.ANTHROPIC_API_KEY_DEV
}

export function aiEnabled(): boolean {
  return Boolean(resolveApiKey())
}

export async function aiText(
  prompt: string,
  opts: { system?: string; maxTokens?: number } = {},
): Promise<string> {
  const apiKey = resolveApiKey()
  if (!apiKey) throw new Error('AI unavailable: set ANTHROPIC_API_KEY_DEV (or ANTHROPIC_API_KEY_PROD when NODE_ENV=production)')

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
        // No sampling params (rejected with 400 on claude-sonnet-5+); thinking
        // disabled so small max_tokens budgets aren't spent on reasoning.
        thinking: { type: 'disabled' },
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
