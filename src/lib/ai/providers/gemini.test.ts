import { describe, expect, it, vi } from 'vitest'
import { generateGemini, normalizeForGemini } from './gemini'
import { AiError } from '../types'

describe('normalizeForGemini', () => {
  it('maps assistant to model and user to user', () => {
    const input = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' },
      { role: 'user' as const, content: 'Can you help?' },
    ]
    expect(normalizeForGemini(input)).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there' }] },
      { role: 'user', parts: [{ text: 'Can you help?' }] },
    ])
  })

  it('drops leading assistant messages so conversation starts with user', () => {
    const input = [
      { role: 'assistant' as const, content: 'Welcome bot greeting' },
      { role: 'user' as const, content: 'Hello' },
    ]
    expect(normalizeForGemini(input)).toEqual([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ])
  })

  it('merges consecutive messages from same role', () => {
    const input = [
      { role: 'user' as const, content: 'Line 1' },
      { role: 'user' as const, content: 'Line 2' },
    ]
    expect(normalizeForGemini(input)).toEqual([
      { role: 'user', parts: [{ text: 'Line 1\n\nLine 2' }] },
    ])
  })

  it('returns placeholder user message if input is empty or all assistant', () => {
    expect(normalizeForGemini([])).toEqual([
      { role: 'user', parts: [{ text: '(The customer has not sent a message yet.)' }] },
    ])
  })
})

describe('generateGemini', () => {
  it('posts with system instruction and x-goog-api-key header and parses output', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello from Gemini!' }],
              role: 'model',
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 10,
          totalTokenCount: 25,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateGemini({
      apiKey: 'test-gemini-key',
      model: 'gemini-3.8-flash',
      systemPrompt: 'You are a helpful CRM assistant.',
      messages: [{ role: 'user', content: 'Hi' }],
      timeoutMs: 5000,
    })

    expect(result.text).toBe('Hello from Gemini!')
    expect(result.usage).toEqual({
      promptTokens: 15,
      completionTokens: 10,
      totalTokens: 25,
    })

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    )
    expect(opts.headers['x-goog-api-key']).toBe('test-gemini-key')
    const body = JSON.parse(opts.body)
    expect(body.system_instruction.parts[0].text).toBe(
      'You are a helpful CRM assistant.',
    )
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hi' }] },
    ])
  })

  it('throws typed AiError on 400 invalid API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 400,
          message: 'API key not valid. Please pass a valid API key.',
          status: 'INVALID_ARGUMENT',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateGemini({
        apiKey: 'bad-key',
        model: 'gemini-3.8-flash',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'Hi' }],
        timeoutMs: 5000,
      }),
    ).rejects.toThrow(AiError)
  })

  it('throws typed AiError on empty response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      generateGemini({
        apiKey: 'test-key',
        model: 'gemini-3.8-flash',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'Hi' }],
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({
      code: 'empty_response',
    })
  })
})
