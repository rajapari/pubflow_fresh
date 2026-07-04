// ── Shared AI client ─────────────────────────────────────
// Thin, dependency-free wrapper over the Anthropic Messages API (called with
// the global fetch). Every LLM-powered bot (intake classifier, AI copyeditor,
// alt-text, reviewer matcher, marketing, …) uses this so there is one place to
// configure model, auth, timeouts and error handling.
//
// Bots MUST call `aiEnabled()` first and degrade gracefully when it returns
// false, so the pipeline keeps working in environments without an API key.

const API_URL  = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1/messages'
const MODEL    = process.env.ANTHROPIC_MODEL    ?? 'claude-sonnet-5'
const VERSION  = process.env.ANTHROPIC_VERSION  ?? '2023-06-01'
const TIMEOUT  = Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 60_000)

export interface AiImage {
  /** e.g. 'image/png', 'image/jpeg', 'image/webp', 'image/gif' */
  mediaType: string
  /** base64-encoded image bytes (no data: prefix) */
  base64: string
}

export interface AiOptions {
  system?: string
  maxTokens?: number
  temperature?: number
  model?: string
  /** Images to attach for vision tasks (graphical-abstract detection, alt-text). */
  images?: AiImage[]
}

/** True when an API key is configured. Bots should check this and fall back. */
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>
  error?: { type: string; message: string }
}

async function callMessages(prompt: string, opts: AiOptions = {}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('AI unavailable: ANTHROPIC_API_KEY is not set')
  }

  const content: ContentBlock[] = []
  for (const img of opts.images ?? []) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })
  }
  content.push({ type: 'text', text: prompt })

  const body = {
    model:       opts.model ?? MODEL,
    max_tokens:  opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: 'user', content }],
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': VERSION,
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    })

    const json = (await res.json()) as MessagesResponse
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`
      throw new Error(`AI request failed: ${msg}`)
    }

    return (json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim()
  } finally {
    clearTimeout(timer)
  }
}

/** Free-text completion. */
export async function aiText(prompt: string, opts: AiOptions = {}): Promise<string> {
  return callMessages(prompt, opts)
}

/**
 * Structured completion. Instructs the model to return JSON, strips any code
 * fences, and parses. Throws if the model does not return valid JSON.
 */
export async function aiJSON<T = unknown>(prompt: string, opts: AiOptions = {}): Promise<T> {
  const guard =
    '\n\nRespond with ONLY a single valid JSON value and no prose, ' +
    'markdown, or code fences.'
  const raw = await callMessages(prompt + guard, opts)
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Last resort: grab the first {...} or [...] span.
    const match = cleaned.match(/[[{][\s\S]*[\]}]/)
    if (match) return JSON.parse(match[0]) as T
    throw new Error(`AI did not return valid JSON: ${cleaned.slice(0, 200)}`)
  }
}
