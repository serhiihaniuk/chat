import { describe, expect, it } from 'vitest'
import { Effect } from 'effect'
import { streamChat, streamChatEffect } from '../src/application/stream-chat.js'
import { ModelUnavailable, RateLimited, Unauthorized, UsageCaptureFailed } from '../src/application/errors.js'
import type { StreamChatDeps } from '../src/application/stream-chat.js'

const collect = async (deps: StreamChatDeps, body: unknown, requestId = 'req-1') => {
  const events: unknown[] = []
  for await (const event of streamChat(deps, { requestId, body })) {
    events.push(event)
  }
  return events
}

const validRequest = {
  workspaceId: 'demo-workspace',
  message: { id: 'msg-1', role: 'user', content: 'hello' },
  model: { provider: 'openai', id: 'gpt-4.1-mini' }
}

const baseDeps: StreamChatDeps = {
  model: {
    async *stream() {
      yield { kind: 'delta', text: 'A' }
      yield { kind: 'done', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
    }
  },
  conversations: {
    async createOrGet() { return 'conv-1' },
    async appendUserMessage() {},
    async appendAssistantMessage() {},
    async readSeededHistory() { return [] }
  },
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
    defaultUserId() { return 'demo-user' }
  }
}

describe('streamChat', () => {
  it('exposes the streaming use case through an Effect v4 boundary', async () => {
    const stream = await Effect.runPromise(streamChatEffect(baseDeps, { requestId: 'req-effect', body: validRequest }))
    const events = []

    for await (const event of stream) events.push(event.type)

    expect(events).toEqual(['sidechat.started', 'sidechat.delta', 'sidechat.completed'])
  })

  it('emits started/delta/completed for a valid request', async () => {
    const events = await collect(baseDeps, validRequest)
    expect(events.map((e) => (e as { type: string }).type)).toEqual(['sidechat.started', 'sidechat.delta', 'sidechat.completed'])
  })

  it('throws ModelUnavailable for unsupported models', async () => {
    const deps = {
      ...baseDeps,
      config: {
        ...baseDeps.config,
        models() { return [{ provider: 'openai', id: 'other-model' }] }
      }
    }

    await expect(collect(deps, validRequest)).rejects.toBeInstanceOf(ModelUnavailable)
  })

  it('throws Unauthorized when auth denies', async () => {
    const deps = {
      ...baseDeps,
      auth: { async authorize() { return false } }
    }
    await expect(collect(deps, validRequest)).rejects.toBeInstanceOf(Unauthorized)
  })

  it('throws RateLimited when rate limit check fails', async () => {
    const deps = {
      ...baseDeps,
      rateLimit: { async check() { return false } }
    }
    await expect(collect(deps, validRequest)).rejects.toBeInstanceOf(RateLimited)
  })

  it('throws UsageCaptureFailed when usage persistence fails', async () => {
    const deps = {
      ...baseDeps,
      usage: {
        async record() {
          throw new Error('store unavailable')
        }
      }
    }

    await expect(collect(deps, validRequest)).rejects.toBeInstanceOf(UsageCaptureFailed)
  })
})
