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

    const response = await createApp().request('/chat/stream', {
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
    const response = await createApp().request('/chat/stream', {
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
})
