import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultDeps } from '../src/inbound/hono/index.js'
import { createPostgresSideChatPersistence } from '@side-chat/db'

const persistence = vi.hoisted(() => ({
  createPostgresSideChatPersistence: vi.fn(),
  createOrGet: vi.fn(),
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  readSeededHistory: vi.fn(),
  recordUsage: vi.fn()
}))

vi.mock('@side-chat/db', () => ({
  createPostgresSideChatPersistence: persistence.createPostgresSideChatPersistence
}))

describe('default deps', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.DATABASE_URL
    persistence.createOrGet.mockResolvedValue('demo-conversation-001')
    persistence.appendUserMessage.mockResolvedValue(undefined)
    persistence.appendAssistantMessage.mockResolvedValue(undefined)
    persistence.readSeededHistory.mockResolvedValue([])
    persistence.recordUsage.mockResolvedValue(undefined)
    persistence.createPostgresSideChatPersistence.mockReturnValue({
      conversations: {
        createOrGet: persistence.createOrGet,
        appendUserMessage: persistence.appendUserMessage,
        appendAssistantMessage: persistence.appendAssistantMessage,
        readSeededHistory: persistence.readSeededHistory
      },
      usage: { record: persistence.recordUsage },
      close: vi.fn()
    })
  })

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
  })

  it('uses in-memory conversation repository when DATABASE_URL is not set', async () => {
    const deps = createDefaultDeps()

    const id = await deps.conversations.createOrGet({ workspaceId: 'demo-workspace', userId: 'demo-user', conversationId: 'demo-conversation-001' })

    expect(id).toBe('demo-conversation-001')
    expect(vi.mocked(createPostgresSideChatPersistence)).not.toHaveBeenCalled()
  })

  it('uses stored-procedure DB adapter when DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = 'postgres://sidechat_app:sidechat_app@postgres:5432/sidechat'
    const deps = createDefaultDeps()
    const id = await deps.conversations.createOrGet({ workspaceId: 'demo-workspace', userId: 'demo-user', conversationId: 'demo-conversation-001' })

    expect(vi.mocked(createPostgresSideChatPersistence)).toHaveBeenCalledWith(process.env.DATABASE_URL)
    expect(persistence.createOrGet).toHaveBeenCalledWith({ workspaceId: 'demo-workspace', userId: 'demo-user', conversationId: 'demo-conversation-001' })
    expect(id).toBe('demo-conversation-001')
  })
})
