import { AiError, type ChatMessage, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'
import { getT } from '@/lib/i18n/translate'

const t = getT('LibErrors')

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GeminiPart {
  text?: string
}

interface GeminiContent {
  role?: 'user' | 'model'
  parts?: GeminiPart[]
}

interface GeminiResponse {
  candidates?: {
    content?: GeminiContent
    finishReason?: string
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

/**
 * Gemini requires alternating turns with roles 'user' and 'model'.
 * Merge consecutive turns with the same role, then drop any leading
 * model turns so the transcript always begins with the customer (user).
 */
export function normalizeForGemini(messages: ChatMessage[]): GeminiContent[] {
  const merged = mergeConsecutive(messages)
  while (merged.length > 0 && merged[0].role === 'assistant') {
    merged.shift()
  }
  if (merged.length === 0) {
    return [
      {
        role: 'user',
        parts: [{ text: '(The customer has not sent a message yet.)' }],
      },
    ]
  }
  return merged.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

/**
 * Call Google Gemini's generateContent endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens
 * in `generateReply`).
 */
export async function generateGemini(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs, baseUrl } = args

  const root = baseUrl ? baseUrl.replace(/\/+$/, '') : GEMINI_API_BASE
  const url = `${root}/${encodeURIComponent(model)}:generateContent`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        ...(systemPrompt
          ? {
              system_instruction: {
                parts: [{ text: systemPrompt }],
              },
            }
          : {}),
        contents: normalizeForGemini(messages),
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    const err = await providerHttpError('Google Gemini', res)
    if (res.status === 400 && /api key/i.test(err.message)) {
      throw new AiError(err.message, { code: 'invalid_key', status: 401 })
    }
    throw err
  }

  const data = (await res.json().catch(() => null)) as GeminiResponse | null
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim()

  if (!text) {
    throw new AiError(t('ai.emptyResponse', { provider: 'Google Gemini' }), {
      code: 'empty_response',
    })
  }

  const usage = normalizeUsage({
    prompt: data?.usageMetadata?.promptTokenCount,
    completion: data?.usageMetadata?.candidatesTokenCount,
    total: data?.usageMetadata?.totalTokenCount,
  })

  return { text, usage }
}
