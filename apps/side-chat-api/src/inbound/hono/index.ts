import { Hono } from 'hono'

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
    }
  }
}

export const createDefaultDeps = (): StreamChatDeps => ({
  model: process.env.SIDE_CHAT_MODEL_ADAPTER === 'openai' && process.env.OPENAI_API_KEY ? openAiModelAdapter : fakeModelAdapter,
  conversations: createMemoryConversationRepository(),
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
    models() { return models },
    defaultUserId() { return process.env.SIDE_CHAT_DEFAULT_USER_ID ?? 'local-user' }
  }
})

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

const streamEvents = (deps: StreamChatDeps, body: unknown, requestId: string, signal?: AbortSignal): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamChat(deps, { requestId, body, signal })) {
          controller.enqueue(encoder.encode(`${encodeSseFrame(event)}\n`))
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`${encodeSseFrame(toProtocolError(requestId, error))}\n`))
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

  app.post(SidechatProtocol.streamRoute, async (c) => {
    const requestId = c.req.header(SidechatRequestIdHeader) ?? crypto.randomUUID()
    let body: unknown

    try {
      body = await c.req.json()
    } catch {
      body = undefined
    }

    const parsed = SidechatRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.body(`${encodeSseFrame({
        type: protocol.error,
        requestId,
        code: 'InvalidRequest',
        message: 'workspaceId, message.content and model.id are required',
        retryable: false
      })}\n`, 400, {
        'Content-Type': SidechatProtocol.streamContentType,
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        [SidechatProtocolHeader]: protocol.protocol,
        [SidechatRequestIdHeader]: requestId
      })
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
