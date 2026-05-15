import { Hono } from 'hono'
import { createPostgresSideChatPersistence } from '@side-chat/db'

import {
  encodeSseFrame,
  protocolArtifacts,
  SidechatProtocol,
  SidechatProtocolHeader,
  SidechatRequestIdHeader,
  SidechatRequestSchema,
  type ModelSelection,
  type SidechatStreamErrorEvent
} from '@side-chat/shared-protocol'
import { fakeModelAdapter } from '../../adapters/ai/fake-model.js'
import { openAiModelAdapter } from '../../adapters/ai/openai-model.js'
import { SideChatDomainError } from '../../application/errors.js'
import { streamChat, type StreamChatDeps } from '../../application/stream-chat.js'
import type { ConversationRepository } from '../../ports/index.js'
import { parseSideChatEnv } from './config.js'


const protocol = protocolArtifacts

const models: ModelSelection[] = [
  { provider: 'openai', id: 'gpt-4.1-mini' },
  { provider: 'openai', id: 'gpt-4.1-nano' }
]

const createMemoryConversationRepository = (): ConversationRepository => {
  const messages = new Map<string, { role: 'user' | 'assistant'; messageId: string; content: string; model?: ModelSelection }[]>()

  return {
    async createOrGet({ conversationId }) {
      const id = conversationId ?? crypto.randomUUID()
      if (!messages.has(id)) messages.set(id, [])
      return id
    },
    async appendUserMessage(conversationId, messageId, content) {
      messages.get(conversationId)?.push({ role: 'user', messageId, content })
    },
    async appendAssistantMessage(conversationId, messageId, content, model) {
      messages.get(conversationId)?.push({ role: 'assistant', messageId, content, model })
    },
    async readSeededHistory(workspaceId, conversationId) {
      if (!conversationId) return []
      if (!messages.has(conversationId)) return []

      return messages.get(conversationId)!.map((entry) => ({
        id: entry.messageId,
        role: entry.role,
        content: entry.content
      }))
    }
  }
}

export const createDefaultDeps = (): StreamChatDeps => {
  const env = parseSideChatEnv()
  const persistence = env.DATABASE_URL ? createPostgresSideChatPersistence(env.DATABASE_URL) : undefined
  const allowlist = env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS
    ? env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS.split(',').map((value) => value.trim()).filter(Boolean)
    : undefined
  const blocklist = env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS
    ? env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS.split(',').map((value) => value.trim()).filter(Boolean)
    : undefined

  return {
    model:
      !env.USE_FAKE_MODEL && env.SIDE_CHAT_MODEL_ADAPTER === 'openai' && env.OPENAI_API_KEY
        ? openAiModelAdapter
        : fakeModelAdapter,
    conversations: persistence?.conversations ?? createMemoryConversationRepository(),
    usage: persistence?.usage ?? { async record() {} },
    auth: {
      async authorize(workspaceId) {
        if (allowlist && allowlist.length > 0) return allowlist.includes(workspaceId)
        if (blocklist && blocklist.includes(workspaceId)) return false
        return true
      }
    },
    rateLimit: { async check(_workspaceId, _userId) { return env.SIDE_CHAT_RATE_LIMITING_ENABLED } },
    billing: { async allow(_workspaceId) { return env.SIDE_CHAT_BILLING_ENABLED } },
    observability: {
      lifecycle() {},
      counter() {},
      async span(_name, run) { return run() }
    },
    config: {
      models() { return models },
      defaultUserId() { return env.SIDE_CHAT_DEFAULT_USER_ID }
    }
  }
}

const toProtocolError = (requestId: string, error: unknown): SidechatStreamErrorEvent => {
  if (error instanceof SideChatDomainError) {
    return {
      type: protocol.error,
      requestId,
      code: error.code,
      message: error.message,
      retryable: error.retryable
    }
  }

  return {
    type: protocol.error,
    requestId,
    code: 'InternalError',
    message: error instanceof Error ? error.message : 'Unexpected stream failure',
    retryable: false
  }
}

const streamErrorResponse = (
  requestId: string,
  status: 400,
  code: string,
  message: string
) => new Response(`${encodeSseFrame({
  type: protocol.error,
  requestId,
  code,
  message,
  retryable: false
})}\n`, {
  status,
  headers: {
    'Content-Type': SidechatProtocol.streamContentType,
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    [SidechatProtocolHeader]: protocol.protocol,
    [SidechatRequestIdHeader]: requestId
  }
})

const streamEvents = (deps: StreamChatDeps, body: unknown, requestId: string, signal?: AbortSignal): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        await deps.observability.span('sidechat.stream', async () => {
          for await (const event of streamChat(deps, { requestId, body, signal })) {
            controller.enqueue(encoder.encode(`${encodeSseFrame(event)}\n`))
          }
        })
      } catch (error) {
        const protocolError = toProtocolError(requestId, error)
        deps.observability.lifecycle(protocolError)
        deps.observability.counter('sidechat.stream.error', { code: protocolError.code })
        controller.enqueue(encoder.encode(`${encodeSseFrame(protocolError)}\n`))
      } finally {
        controller.close()
      }
    }
  })
}

export const createInboundApp = (deps: StreamChatDeps = createDefaultDeps()) => {
  const app = new Hono()

  app.get(SidechatProtocol.healthRoute, (c) => c.json({ ok: true }))
  app.get(SidechatProtocol.modelsRoute, (c) => c.json({ models: deps.config.models() }))

  app.get('/chat/history', async (c) => {
    const workspaceId = c.req.query('workspaceId') ?? ''
    const conversationId = c.req.query('conversationId') ?? ''

    if (!workspaceId || !conversationId) {
      return c.json({ error: 'workspaceId and conversationId are required' }, 400)
    }

    const rows = await deps.conversations.readSeededHistory(workspaceId, conversationId)
    return c.json({ conversationId, messages: rows })
  })

  app.post(SidechatProtocol.streamRoute, async (c) => {
    const requestId = c.req.header(SidechatRequestIdHeader) ?? crypto.randomUUID()
    const protocolHeader = c.req.header(SidechatProtocolHeader)

    if (protocolHeader !== protocol.protocol) {
      return streamErrorResponse(requestId, 400, 'InvalidProtocol', 'X-Sidechat-Protocol: sidechat.v1 is required')
    }

    let body: unknown

    try {
      body = await c.req.json()
    } catch {
      body = undefined
    }

    const parsed = SidechatRequestSchema.safeParse(body)
    if (!parsed.success) {
      return streamErrorResponse(requestId, 400, 'InvalidRequest', 'workspaceId, message.content and model.id are required')
    }

    return c.body(streamEvents(deps, parsed.data, requestId, c.req.raw.signal), 200, {
      'Content-Type': SidechatProtocol.streamContentType,
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      [SidechatProtocolHeader]: protocol.protocol,
      [SidechatRequestIdHeader]: requestId
    })
  })

  return app
}

export const inboundApp = createInboundApp()
