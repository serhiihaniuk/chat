import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultDeps } from '../src/inbound/hono/index.js'
import { createDbFromUrl } from '@side-chat/db'

let queryMock = vi.fn().mockResolvedValue({ rows: [{ conversation_id: 'demo-conversation-001' }] })
let createOrGetConversationMock = vi.fn()

vi.mock('@side-chat/db', async () => {
  const actual = await vi.importActual<typeof import('@side-chat/db')>('@side-chat/db')

  return {
    ...actual,
    createDbFromUrl: vi.fn(() => ({
      createOrGetConversation: (...args: unknown[]) => {
        createOrGetConversationMock(...args)
        return queryMock()
      },
      appendUserMessage: (...args: unknown[]) => queryMock(...args),
      appendAssistantMessage: (...args: unknown[]) => queryMock(...args),
      recordUsage: (...args: unknown[]) => queryMock(...args)
    }))
  }
})

describe('default deps', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL

  beforeEach(() => {
    vi.clearAllMocks()
    queryMock = vi.fn().mockResolvedValue({ rows: [{ conversation_id: 'demo-conversation-001' }] })
    createOrGetConversationMock = vi.fn()
    delete process.env.DATABASE_URL
  })

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
  })

  it('uses in-memory conversation repository when DATABASE_URL is not set', async () => {
    const deps = createDefaultDeps()

    const id = await deps.conversations.createOrGet({ workspaceId: 'demo-workspace', userId: 'demo-user', conversationId: 'demo-conversation-001' })

    expect(id).toBe('demo-conversation-001')
    expect(vi.mocked(createDbFromUrl)).not.toHaveBeenCalled()
  })

  it('uses stored-procedure DB adapter when DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = 'postgres://sidechat_app:sidechat_app@postgres:5432/sidechat'
    const deps = createDefaultDeps()
    const id = await deps.conversations.createOrGet({ workspaceId: 'demo-workspace', userId: 'demo-user', conversationId: 'demo-conversation-001' })

    expect(vi.mocked(createDbFromUrl)).toHaveBeenCalledWith(process.env.DATABASE_URL)
    expect(createOrGetConversationMock).toHaveBeenCalledWith('demo-workspace', 'demo-user', 'demo-conversation-001')
    expect(id).toBe('demo-conversation-001')
  })
})
