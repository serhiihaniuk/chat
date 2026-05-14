import { Hono } from 'hono'
import { z } from 'zod'

import {
  protocolArtifacts,
  SidechatRequestSchema,
  encodeSseFrame
} from '@side-chat/shared-protocol'

const protocol = protocolArtifacts

const app = new Hono()

const models = [
  { provider: 'openai', id: 'gpt-4.1-mini' },
  { provider: 'openai', id: 'gpt-4.1-nano' }
]

const requestSchema = SidechatRequestSchema.extend({
  message: z.object({ id: z.string().min(1), role: z.literal('user'), content: z.string().min(1) })
})

app.get('/health', (c) => c.json({ ok: true, status: 'healthy', timestamp: new Date().toISOString() }))
app.get('/models', (c) => c.json({ models }))

app.post('/chat/stream', async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json({ code: 'invalid_request', message: 'workspaceId, message.content and model.id are required' }, 400)
  }

  const request = parsed.data
  const requestId = c.req.header('X-Request-Id') ?? crypto.randomUUID()
  const streamBody = [
    encodeSseFrame({
      type: protocol.start,
      requestId,
      conversationId: request.conversationId ?? 'demo-conversation-001',
      messageId: request.message.id,
      model: request.model
    }),
    encodeSseFrame({
      type: protocol.completed,
      requestId,
      conversationId: request.conversationId ?? 'demo-conversation-001',
      messageId: `${request.message.id}-asst`,
      model: request.model,
      finishReason: 'stop',
      usage: { inputTokens: 9, outputTokens: 12, totalTokens: 21 }
    })
  ].join('\n')

  return c.body(streamBody, 200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Sidechat-Protocol': protocol.protocol,
    'X-Request-Id': requestId
  })
})

export { app as inboundApp }
