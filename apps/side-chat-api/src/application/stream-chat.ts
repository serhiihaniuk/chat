import { SidechatRequestSchema, type SidechatStreamEvent, type SidechatRequest } from '@side-chat/shared-protocol'
import type { AuthPort, BillingPort, ConfigPort, ConversationRepository, ModelPort, ObservabilityPort, RateLimitPort, UsagePort } from '../ports/index.js'
import { ModelUnavailable, RateLimited, Unauthorized, UsageCaptureFailed } from './errors.js'

export type StreamChatDeps = { model: ModelPort; conversations: ConversationRepository; usage: UsagePort; auth: AuthPort; rateLimit: RateLimitPort; billing: BillingPort; observability: ObservabilityPort; config: ConfigPort }
export type StreamChatInput = { requestId: string; body: unknown; signal?: AbortSignal }

export async function* streamChat(deps: StreamChatDeps, input: StreamChatInput): AsyncIterable<SidechatStreamEvent> {
  const request = SidechatRequestSchema.parse(input.body) satisfies SidechatRequest
  const userId = deps.config.defaultUserId()
  if (!deps.config.models().some((model) => model.provider === request.model.provider && model.id === request.model.id)) throw new ModelUnavailable(request.model.id)
  if (!(await deps.auth.authorize(request.workspaceId, userId))) throw new Unauthorized()
  if (!(await deps.rateLimit.check(request.workspaceId, userId))) throw new RateLimited()
  if (!(await deps.billing.allow(request.workspaceId))) throw new Unauthorized()

  const conversationId = await deps.conversations.createOrGet({ workspaceId: request.workspaceId, userId, conversationId: request.conversationId })
  await deps.conversations.appendUserMessage(conversationId, request.message.id, request.message.content)
  const assistantMessageId = `${input.requestId}-assistant`
  const started: SidechatStreamEvent = { type: 'sidechat.started', conversationId, messageId: assistantMessageId, requestId: input.requestId, model: request.model }
  deps.observability.lifecycle(started)
  deps.observability.counter('sidechat.stream.started', { model: request.model.id })
  yield started

  let assistantContent = ''
  let index = 0
  for await (const chunk of deps.model.stream(request, input.signal)) {
    if (chunk.kind === 'delta') {
      assistantContent += chunk.text
      const event: SidechatStreamEvent = {
        type: 'sidechat.delta',
        requestId: input.requestId,
        messageId: assistantMessageId,
        content: chunk.text,
        index
      }
      index += 1
      deps.observability.lifecycle(event)
      yield event
      continue
    }

    await deps.conversations.appendAssistantMessage(conversationId, assistantMessageId, assistantContent, request.model)
    try {
      await deps.usage.record({ requestId: input.requestId, conversationId, messageId: assistantMessageId, model: request.model, usage: chunk.usage })
    } catch {
      throw new UsageCaptureFailed()
    }
    const completed: SidechatStreamEvent = {
      type: 'sidechat.completed',
      requestId: input.requestId,
      conversationId,
      messageId: assistantMessageId,
      model: request.model,
      finishReason: chunk.finishReason,
      usage: chunk.usage
    }
    deps.observability.lifecycle(completed)
    deps.observability.counter('sidechat.stream.completed', { model: request.model.id })
    yield completed
  }
}
