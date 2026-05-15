import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSseFrames, protocolVersion, validateSidechatEventSequence } from '@side-chat/shared-protocol'
import { createApp } from '../src/inbound/hono/app.js'

const dbPersistence = vi.hoisted(() => ({
  createPostgresSideChatPersistence: vi.fn(),
  createOrGet: vi.fn(),
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  recordUsage: vi.fn()
}))

vi.mock('@side-chat/db', () => ({
  createPostgresSideChatPersistence: dbPersistence.createPostgresSideChatPersistence
}))

const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  SIDE_CHAT_MODEL_ADAPTER: process.env.SIDE_CHAT_MODEL_ADAPTER
}

const streamRequest = (content = 'Explain this report') => ({
  workspaceId: 'demo-workspace',
  conversationId: 'demo-conversation-001',
  message: { id: 'client-msg-001', role: 'user' as const, content },
  model: { provider: 'openai', id: 'gpt-4.1-mini' }
})

const seededMessageHistory = [
  { id: 'seed-user-1', role: 'user', content: 'Seed message' },
  { id: 'seed-asst-1', role: 'assistant', content: 'Seed reply' }
]

describe('hono adapter', () => {
  afterEach(() => {
    vi.clearAllMocks()
    if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalEnv.DATABASE_URL

    if (originalEnv.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY

    if (originalEnv.SIDE_CHAT_MODEL_ADAPTER === undefined) delete process.env.SIDE_CHAT_MODEL_ADAPTER
    else process.env.SIDE_CHAT_MODEL_ADAPTER = originalEnv.SIDE_CHAT_MODEL_ADAPTER
  })

  it('serves health and exact supported models', async () => {
    const app = createApp()
    const health = await app.request('/health')
    expect(health.status).toBe(200)
    expect(health.headers.get('Content-Type')).toContain('application/json')
    expect(await health.json()).toEqual({ ok: true })

    const models = await app.request('/models')
    expect(models.status).toBe(200)
    expect(models.headers.get('Content-Type')).toContain('application/json')
    expect(await models.json()).toEqual({
      models: [
        { provider: 'openai', id: 'gpt-4.1-mini' },
        { provider: 'openai', id: 'gpt-4.1-nano' }
      ]
    })
  })

  it('streams sidechat.v1 event sequence without provider tokens', async () => {
    process.env.SIDE_CHAT_MODEL_ADAPTER = 'openai'
    delete process.env.OPENAI_API_KEY
    const app = createApp()

    const response = await createApp().request('/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Sidechat-Protocol': protocolVersion,
        'X-Request-Id': 'req-test'
      },
      body: JSON.stringify(streamRequest())
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform')
    expect(response.headers.get('X-Sidechat-Protocol')).toBe(protocolVersion)
    expect(response.headers.get('X-Request-Id')).toBe('req-test')

    const frames = parseSseFrames(await response.text())
    expect(frames.map((frame) => frame.type)).toEqual([
      'sidechat.started',
      'sidechat.delta',
      'sidechat.delta',
      'sidechat.delta',
      'sidechat.completed'
    ])
    expect(validateSidechatEventSequence(frames)).toEqual({ ok: true })
    expect(frames.every((frame) => frame.requestId === 'req-test')).toBe(true)
    expect(frames[0]).toMatchObject({
      requestId: 'req-test',
      conversationId: 'demo-conversation-001',
      messageId: 'req-test-assistant',
      model: { provider: 'openai', id: 'gpt-4.1-mini' }
    })
    expect(frames[1]).toMatchObject({ requestId: 'req-test', messageId: 'req-test-assistant', index: 0 })
    expect(frames[2]).toMatchObject({ requestId: 'req-test', messageId: 'req-test-assistant', index: 1 })
    expect(frames[3]).toMatchObject({ requestId: 'req-test', messageId: 'req-test-assistant', index: 2 })
    expect(frames.at(-1)).toMatchObject({
      requestId: 'req-test',
      conversationId: 'demo-conversation-001',
      messageId: 'req-test-assistant',
      model: { provider: 'openai', id: 'gpt-4.1-mini' },
      usage: { inputTokens: 3, outputTokens: 18, totalTokens: 21 }
    })
  })


  it('uses database-backed persistence when DATABASE_URL is configured', async () => {
    process.env.DATABASE_URL = 'postgres://sidechat_app:sidechat_app@localhost:5432/sidechat'
    dbPersistence.createOrGet.mockResolvedValue('conv-from-db')
    dbPersistence.appendUserMessage.mockResolvedValue(undefined)
    dbPersistence.appendAssistantMessage.mockResolvedValue(undefined)
    dbPersistence.recordUsage.mockResolvedValue(undefined)
    dbPersistence.createPostgresSideChatPersistence.mockReturnValue({
      conversations: {
        createOrGet: dbPersistence.createOrGet,
        appendUserMessage: dbPersistence.appendUserMessage,
        appendAssistantMessage: dbPersistence.appendAssistantMessage
      },
      usage: { record: dbPersistence.recordUsage },
      close: vi.fn()
    })

    const app = createApp()

    const response = await app.request('/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Sidechat-Protocol': protocolVersion,
        'X-Request-Id': 'req-db'
      },
      body: JSON.stringify(streamRequest('Persist this'))
    })

    expect(response.status).toBe(200)
    const frames = parseSseFrames(await response.text())
    expect(frames[0]).toMatchObject({ type: 'sidechat.started', conversationId: 'conv-from-db' })
    expect(frames.at(-1)).toMatchObject({ type: 'sidechat.completed', conversationId: 'conv-from-db' })
    expect(dbPersistence.createPostgresSideChatPersistence).toHaveBeenCalledWith('postgres://sidechat_app:sidechat_app@localhost:5432/sidechat')
    expect(dbPersistence.createOrGet).toHaveBeenCalledWith({ workspaceId: 'demo-workspace', userId: 'local-user', conversationId: 'demo-conversation-001' })
    expect(dbPersistence.appendUserMessage).toHaveBeenCalledWith('conv-from-db', 'client-msg-001', 'Persist this')
    expect(dbPersistence.appendAssistantMessage).toHaveBeenCalledWith('conv-from-db', 'req-db-assistant', expect.stringContaining('Persist this'), { provider: 'openai', id: 'gpt-4.1-mini' })
    expect(dbPersistence.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-db', conversationId: 'conv-from-db', messageId: 'req-db-assistant' }))
  })

  it('streams protocol-valid error events for model failures', async () => {
    const lifecycle = vi.fn()
    const counter = vi.fn()
    const span = vi.fn(async (_name: string, run: () => Promise<void>) => run())
    const app = createApp({
      conversations: {
        async createOrGet() { return 'demo-conversation-001' },
        async appendUserMessage() {},
        async appendAssistantMessage() {},
        async readSeededHistory() { return [] }
      },
      model: {
        async *stream() {
          throw new Error('fake model failure')
        }
      },
      usage: { async record() {} },
      auth: { async authorize() { return true } },
      rateLimit: { async check() { return true } },
      billing: { async allow() { return true } },
      observability: { lifecycle, counter, span },
      config: {
        models() { return [{ provider: 'openai', id: 'gpt-4.1-mini' }] },
        defaultUserId() { return 'local-user' }
      }
    })

    const response = await app.request('/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Sidechat-Protocol': protocolVersion,
        'X-Request-Id': 'req-fail'
      },
      body: JSON.stringify(streamRequest('please fail now'))
    })

    expect(response.status).toBe(200)
    const frames = parseSseFrames(await response.text())
    expect(frames.map((frame) => frame.type)).toEqual(['sidechat.started', 'sidechat.error'])
    expect(validateSidechatEventSequence(frames)).toEqual({ ok: true })
    expect(frames.at(-1)).toMatchObject({
      type: 'sidechat.error',
      requestId: 'req-fail',
      code: 'InternalError',
      retryable: false
    })
    expect(span).toHaveBeenCalledWith('sidechat.stream', expect.any(Function))
    expect(lifecycle).toHaveBeenCalledWith(expect.objectContaining({ type: 'sidechat.error', requestId: 'req-fail' }))
    expect(counter).toHaveBeenCalledWith('sidechat.stream.error', { code: 'InternalError' })
  })

  it('rejects missing or invalid sidechat protocol headers before streaming', async () => {
    const cases: Array<Record<string, string>> = [
      { 'X-Request-Id': 'req-missing-protocol' },
      { 'X-Sidechat-Protocol': 'sidechat.v0', 'X-Request-Id': 'req-wrong-protocol' }
    ]

    for (const headers of cases) {
      const response = await createApp().request('/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...headers
        },
        body: JSON.stringify(streamRequest())
      })

      expect(response.status).toBe(400)
      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
      expect(response.headers.get('X-Sidechat-Protocol')).toBe(protocolVersion)
      const frames = parseSseFrames(await response.text())
      expect(frames).toEqual([
        {
          type: 'sidechat.error',
          requestId: headers['X-Request-Id'],
          code: 'InvalidProtocol',
          message: 'X-Sidechat-Protocol: sidechat.v1 is required',
          retryable: false
        }
      ])
      expect(validateSidechatEventSequence(frames)).toEqual({ ok: true })
    }
  })

  it('returns a typed unauthorized error frame for auth denial', async () => {
    const response = await createApp({
      auth: { async authorize() { return false } },
      rateLimit: { async check() { return true } },
      billing: { async allow() { return true } },
      usage: { async record() {} },
      model: { async *stream() { return } },
      conversations: {
        async createOrGet() { return 'demo-conversation-001' },
        async appendUserMessage() {},
        async appendAssistantMessage() {},
        async readSeededHistory() { return [] }
      },
      observability: {
        lifecycle() {},
        counter() {},
        async span(_name, run) { return run() }
      },
      config: {
        models() { return [{ provider: 'openai', id: 'gpt-4.1-mini' }] },
        defaultUserId() { return 'local-user' }
      }
    }).request('/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Sidechat-Protocol': protocolVersion,
        'X-Request-Id': 'req-unauth'
      },
      body: JSON.stringify(streamRequest())
    })

    expect(response.status).toBe(200)
    const frames = parseSseFrames(await response.text())
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      type: 'sidechat.error',
      requestId: 'req-unauth',
      code: 'Unauthorized',
      retryable: false
    })
  })

  it('returns a typed ratelimit error frame when request is blocked', async () => {
    const response = await createApp({
      auth: { async authorize() { return true } },
      rateLimit: { async check() { return false } },
      billing: { async allow() { return true } },
      usage: { async record() {} },
      model: { async *stream() { return } },
      conversations: {
        async createOrGet() { return 'demo-conversation-001' },
        async appendUserMessage() {},
        async appendAssistantMessage() {},
        async readSeededHistory() { return [] }
      },
      observability: {
        lifecycle() {},
        counter() {},
        async span(_name, run) { return run() }
      },
      config: {
        models() { return [{ provider: 'openai', id: 'gpt-4.1-mini' }] },
        defaultUserId() { return 'local-user' }
      }
    }).request('/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Sidechat-Protocol': protocolVersion,
        'X-Request-Id': 'req-rate'
      },
      body: JSON.stringify(streamRequest())
    })

    expect(response.status).toBe(200)
    const frames = parseSseFrames(await response.text())
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      type: 'sidechat.error',
      requestId: 'req-rate',
      code: 'RateLimited',
      retryable: true
    })
  })

  it('returns a typed usage failure error frame when usage record throws', async () => {
    const response = await createApp({
      auth: { async authorize() { return true } },
      rateLimit: { async check() { return true } },
      billing: { async allow() { return true } },
      usage: { async record() { throw new Error('db write failed') } },
      model: { async *stream() { yield { kind: 'done', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } } } },
      conversations: {
        async createOrGet() { return 'demo-conversation-001' },
        async appendUserMessage() {},
        async appendAssistantMessage() {},
        async readSeededHistory() { return [] }
      },
      observability: {
        lifecycle() {},
        counter() {},
        async span(_name, run) { return run() }
      },
      config: {
        models() { return [{ provider: 'openai', id: 'gpt-4.1-mini' }] },
        defaultUserId() { return 'local-user' }
      }
    }).request('/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Sidechat-Protocol': protocolVersion,
        'X-Request-Id': 'req-usage'
      },
      body: JSON.stringify(streamRequest('record usage failure'))
    })

    expect(response.status).toBe(200)
    const frames = parseSseFrames(await response.text())
    expect(frames).toHaveLength(2)
    expect(frames[0]).toMatchObject({ type: 'sidechat.started', requestId: 'req-usage' })
    expect(frames[1]).toMatchObject({
      type: 'sidechat.error',
      requestId: 'req-usage',
      code: 'UsageCaptureFailed',
      retryable: true
    })
  })

  it('returns a typed model unavailable frame when requested model is not configured', async () => {
    const response = await createApp({
      auth: { async authorize() { return true } },
      rateLimit: { async check() { return true } },
      billing: { async allow() { return true } },
      usage: { async record() {} },
      model: { async *stream() { return } },
      conversations: {
        async createOrGet() { return 'demo-conversation-001' },
        async appendUserMessage() {},
        async appendAssistantMessage() {},
        async readSeededHistory() { return [] }
      },
      observability: {
        lifecycle() {},
        counter() {},
        async span(_name, run) { return run() }
      },
      config: {
        models() { return [{ provider: 'openai', id: 'gpt-4.1-mini' }] },
        defaultUserId() { return 'local-user' }
      }
    }).request('/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Sidechat-Protocol': protocolVersion,
        'X-Request-Id': 'req-model'
      },
      body: JSON.stringify({
        workspaceId: 'demo-workspace',
        message: { id: 'client-msg-001', role: 'user', content: 'test' },
        conversationId: 'demo-conversation-001',
        model: { provider: 'openai', id: 'does-not-exist' }
      })
    })

    expect(response.status).toBe(200)
    const frames = parseSseFrames(await response.text())
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      type: 'sidechat.error',
      requestId: 'req-model',
      code: 'ModelUnavailable',
      retryable: false
    })
  })

  it('returns protocol error SSE for invalid requests', async () => {
    const response = await createApp().request('/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Sidechat-Protocol': protocolVersion,
        'X-Request-Id': 'req-bad'
      },
      body: JSON.stringify({ workspaceId: '', message: { id: 'm1', role: 'user', content: '' }, model: { provider: 'openai', id: '' } })
    })

    expect(response.status).toBe(400)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform')
    expect(response.headers.get('X-Sidechat-Protocol')).toBe(protocolVersion)
    expect(response.headers.get('X-Request-Id')).toBe('req-bad')
    const frames = parseSseFrames(await response.text())
    expect(frames).toEqual([
      {
        type: 'sidechat.error',
        requestId: 'req-bad',
        code: 'InvalidRequest',
        message: 'workspaceId, message.content and model.id are required',
        retryable: false
      }
    ])
    expect(validateSidechatEventSequence(frames)).toEqual({ ok: true })
  })

  it('returns seeded conversation history for a known conversation', async () => {
    const app = createApp({
      conversations: {
        async createOrGet() { return 'demo-conversation-001' },
        async appendUserMessage() {},
        async appendAssistantMessage() {},
        async readSeededHistory() { return seededMessageHistory }
      },
      model: { async *stream() {} },
      usage: { async record() {} },
      auth: { async authorize() { return true } },
      rateLimit: { async check() { return true } },
      billing: { async allow() { return true } },
      observability: {
        lifecycle() {},
        counter() {},
        async span(_name, run) { return run() }
      },
      config: {
        models() { return [{ provider: 'openai', id: 'gpt-4.1-mini' }] },
        defaultUserId() { return 'local-user' }
      }
    })

    const response = await app.request('/chat/history?workspaceId=demo-workspace&conversationId=demo-conversation-001')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ conversationId: 'demo-conversation-001', messages: seededMessageHistory })
  })

  it('requires workspaceId and conversationId for chat history', async () => {
    const response = await createApp().request('/chat/history?workspaceId=demo-workspace')
    expect(response.status).toBe(400)
  })

  it('requires authorization for history access', async () => {
    const app = createApp({
      conversations: {
        async createOrGet() { return 'demo-conversation-001' },
        async appendUserMessage() {},
        async appendAssistantMessage() {},
        async readSeededHistory() { return seededMessageHistory }
      },
      model: { async *stream() {} },
      usage: { async record() {} },
      auth: { async authorize() { return false } },
      rateLimit: { async check() { return true } },
      billing: { async allow() { return true } },
      observability: {
        lifecycle() {},
        counter() {},
        async span(_name, run) { return run() }
      },
      config: {
        models() { return [{ provider: 'openai', id: 'gpt-4.1-mini' }] },
        defaultUserId() { return 'local-user' }
      }
    })

    const response = await app.request('/chat/history?workspaceId=demo-workspace&conversationId=demo-conversation-001')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })
})
