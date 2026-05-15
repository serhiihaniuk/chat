export * from './sidechat.v1/types.js'
export * from './sidechat.v1/schemas.js'
export * from './sidechat.v1/codec.js'
export * from './sidechat.v1/sequence.js'
export * from './sidechat.v1/contracts.js'

import type {
  SidechatStreamCompletedEvent,
  SidechatStreamDeltaEvent,
  SidechatStreamErrorEvent,
  SidechatStreamEvent,
  SidechatStreamHistoryEvent,
  SidechatStreamStartEvent
} from './sidechat.v1/types.js'
import { SidechatProtocolVersion } from './sidechat.v1/types.js'
import {
  encodeSseEvent,
  encodeSseFrame,
  parseKnownSsePayloads,
  parseSseEvent,
  protocolLinePrefix
} from './sidechat.v1/codec.js'
import { SidechatRequestSchema } from './sidechat.v1/schemas.js'

export const protocolVersion = SidechatProtocolVersion
export const streamRequestSchema = SidechatRequestSchema
export const encodeSse = encodeSseEvent
export const encodeSseEventFrame = encodeSseFrame
export const parseSse = parseSseEvent

export const goldenSuccessEvents: SidechatStreamEvent[] = [
  {
    type: 'sidechat.started',
    requestId: 'req-001',
    conversationId: 'conv-001',
    messageId: 'msg-asst-001',
    model: { provider: 'openai', id: 'gpt-4.1-mini' }
  },
  {
    type: 'sidechat.delta',
    requestId: 'req-001',
    messageId: 'msg-asst-001',
    content: 'Hello',
    index: 0
  },
  {
    type: 'sidechat.delta',
    requestId: 'req-001',
    messageId: 'msg-asst-001',
    content: ' world',
    index: 1
  },
  {
    type: 'sidechat.completed',
    requestId: 'req-001',
    conversationId: 'conv-001',
    messageId: 'msg-asst-001',
    model: { provider: 'openai', id: 'gpt-4.1-mini' },
    finishReason: 'stop',
    usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 }
  }
]

export const goldenErrorEvents: SidechatStreamEvent[] = [
  {
    type: 'sidechat.started',
    requestId: 'req-err-001',
    conversationId: 'conv-001',
    messageId: 'msg-asst-002',
    model: { provider: 'openai', id: 'gpt-4.1-mini' }
  },
  {
    type: 'sidechat.error',
    requestId: 'req-err-001',
    code: 'MODEL_UNAVAILABLE',
    message: 'Model currently unavailable',
    retryable: true
  }
]

const parsePrefixSeparatedDataLines = (chunk: string): SidechatStreamEvent[] => chunk
  .split(protocolLinePrefix)
  .filter(Boolean)
  .map((segment) => {
    const payload = segment.startsWith(' ') ? segment.slice(1) : segment
    return parseSseEvent(`${protocolLinePrefix} ${payload.trim()}`)
  })
  .filter((event): event is SidechatStreamEvent => event !== undefined)

export { parseSseEvent }
export const parseSseFrames = (chunk: string): SidechatStreamEvent[] => {
  const framed = parseKnownSsePayloads(chunk)
  return framed.length > 0 ? framed : parsePrefixSeparatedDataLines(chunk)
}

export type {
  SidechatStreamStartEvent,
  SidechatStreamDeltaEvent,
  SidechatStreamCompletedEvent,
  SidechatStreamErrorEvent,
  SidechatStreamHistoryEvent
}
export * from './sidechat.v1/validation.js'
