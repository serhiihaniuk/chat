import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  SidechatStreamEventSchema,
  SidechatRequestSchema,
  protocolArtifacts,
  encodeSseEvent,
  parseSseEvent,
  encodeSseFrame,
  protocolLinePrefix,
  SidechatStreamEvent,
  parseKnownSsePayloads,
  parseSsePayload,
  SidechatProtocolHeader,
  SidechatStreamResponseHeadersSchema,
  SidechatRequestHeadersSchema,
  validateRequest,
  validateRequestHeaders,
  validateStreamEvent
} from '../src'
import { validateSidechatEventSequence } from '../src/sidechat.v1/sequence'

describe('sidechat protocol v1 fixtures', () => {
  const fixturesDir = path.resolve(__dirname, '../src/sidechat.v1/fixtures')

  test('success fixture validates', () => {
    const raw = JSON.parse(readFileSync(path.join(fixturesDir, 'success-stream.json'), 'utf8'))
    expect(raw.protocol).toBe('sidechat.v1')
    for (const event of raw.events) {
      expect(SidechatStreamEventSchema.parse(event)).toBeTruthy()
    }
  })

  test('error fixture validates', () => {
    const raw = JSON.parse(readFileSync(path.join(fixturesDir, 'error-stream.json'), 'utf8'))
    expect(raw.protocol).toBe(protocolArtifacts.protocol)
    for (const event of raw.events) {
      expect(SidechatStreamEventSchema.parse(event)).toBeTruthy()
    }
  })

  test('request schema requires workspace and message content', () => {
    const valid = {
      workspaceId: 'demo-workspace',
      message: { id: 'm1', role: 'user', content: 'hi' },
      model: { provider: 'openai', id: 'gpt-4.1-mini' }
    }

    const parsed = SidechatRequestSchema.parse(valid)
    expect(parsed.workspaceId).toBe('demo-workspace')
  })

  test('sse encode/decode roundtrip for delta and completed events', () => {
    const parsed = SidechatRequestSchema.parse({
      workspaceId: 'demo-workspace',
      message: { id: 'm-1', role: 'user', content: 'ping' },
      model: { provider: 'openai', id: 'gpt-4.1-mini' }
    })
    expect(parsed.workspaceId).toBe('demo-workspace')

    const payload = {
      type: 'sidechat.delta',
      requestId: 'req-1',
      messageId: 'msg-1',
      content: 'Hi',
      index: 0
    } as const

    const line = encodeSseEvent(payload)
    expect(line.startsWith(`${protocolLinePrefix} `)).toBe(true)
    expect(parseSseEvent(line)).toEqual(payload)

    const frame = encodeSseFrame({
      ...payload,
      type: 'sidechat.delta'
    })
    expect(frame.includes('event: sidechat.delta')).toBe(true)
  })

  test('stream validator requires terminal event', () => {
    const events = [
      {
        type: 'sidechat.started',
        requestId: 'req-1',
        conversationId: 'conv',
        messageId: 'msg-user',
        model: { provider: 'openai', id: 'gpt-4.1-mini' }
      },
      {
        type: 'sidechat.delta',
        requestId: 'req-1',
        messageId: 'msg-asst',
        content: 'x',
        index: 0
      }
    ]

    const result = validateSidechatEventSequence(events)
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ code: 'missing_terminal_event' })
  })

  test('stream validator rejects multiple terminal events', () => {
    const started = {
      type: 'sidechat.started',
      requestId: 'req-1',
      conversationId: 'conv',
      messageId: 'msg-user',
      model: { provider: 'openai', id: 'gpt-4.1-mini' }
    } as const

    const completed = {
      type: 'sidechat.completed',
      requestId: 'req-1',
      conversationId: 'conv',
      messageId: 'msg-asst',
      model: { provider: 'openai', id: 'gpt-4.1-mini' },
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
    } as const

    const error = {
      type: 'sidechat.error',
      requestId: 'req-1',
      code: 'ERR',
      message: 'fail',
      retryable: true
    } as const

    const result = validateSidechatEventSequence([
      started as SidechatStreamEvent,
      completed,
      error
    ])
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ code: 'multiple_terminal_events' })
  })

  test('stream validator rejects multiple started events', () => {
    const started = {
      type: 'sidechat.started',
      requestId: 'req-1',
      conversationId: 'conv',
      messageId: 'msg-user',
      model: { provider: 'openai', id: 'gpt-4.1-mini' }
    } as const

    const completed = {
      type: 'sidechat.completed',
      requestId: 'req-1',
      conversationId: 'conv',
      messageId: 'msg-asst',
      model: { provider: 'openai', id: 'gpt-4.1-mini' },
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
    } as const

    const result = validateSidechatEventSequence([started, completed, started])
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ code: 'multiple_started_events' })
  })

  test('stream validator rejects deltas after terminal', () => {
    const sequence: SidechatStreamEvent[] = [
      {
        type: 'sidechat.started',
        requestId: 'req-1',
        conversationId: 'conv',
        messageId: 'msg-user',
        model: { provider: 'openai', id: 'gpt-4.1-mini' }
      },
      {
        type: 'sidechat.completed',
        requestId: 'req-1',
        conversationId: 'conv',
        messageId: 'msg-asst',
        model: { provider: 'openai', id: 'gpt-4.1-mini' },
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
      },
      {
        type: 'sidechat.delta',
        requestId: 'req-1',
        messageId: 'msg-asst',
        content: 'x',
        index: 1
      }
    ]

    const result = validateSidechatEventSequence(sequence)
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ code: 'delta_after_terminal' })
  })

  test('sse parser ignores unknown event types and recovers only known known events', () => {
    const chunk = [
      'event: sidechat.delta',
      'data: {"type":"sidechat.delta","requestId":"r1","messageId":"m1","content":"A","index":0}',
      '',
      'event: sidechat.unknown',
      'data: {"foo":1}',
      '',
      `data: {"type":"sidechat.completed","requestId":"r1","conversationId":"c1","messageId":"m2","model":{"provider":"openai","id":"gpt-4.1-mini"},"finishReason":"stop","usage":{"inputTokens":1,"outputTokens":2,"totalTokens":3}}`,
      ''
    ].join('\n')

    const payloads = parseSsePayload(chunk)
    expect(payloads.length).toBe(3)
    expect(payloads[1]?.event).toBe('sidechat.unknown')

    const events = parseKnownSsePayloads(chunk)
    expect(events.length).toBe(2)
    expect(events[0]?.type).toBe('sidechat.delta')
    expect(events[1]?.type).toBe('sidechat.completed')
  })

  test('request headers validate required protocol header', () => {
    expect(() => SidechatRequestHeadersSchema.parse({ [SidechatProtocolHeader]: 'sidechat.v1' })).not.toThrow()
  })

  test('response headers validate stream contract', () => {
    expect(() =>
      SidechatStreamResponseHeadersSchema.parse({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Sidechat-Protocol': 'sidechat.v1',
        'X-Request-Id': 'req-1'
      })
    ).not.toThrow()
  })

  test('terminal validation rejects invalid terminal request id consistency', () => {
    const result = validateSidechatEventSequence([
      {
        type: 'sidechat.started',
        requestId: 'req-1',
        conversationId: 'c1',
        messageId: 'm1',
        model: { provider: 'openai', id: 'gpt-4.1-mini' }
      },
      {
        type: 'sidechat.completed',
        requestId: 'req-2',
        conversationId: 'c1',
        messageId: 'm2',
        model: { provider: 'openai', id: 'gpt-4.1-mini' },
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
      }
    ])

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ code: 'terminal_request_mismatch' })
  })

  test('shared validation helpers expose schema result', () => {
    const reqResult = validateRequest({
      workspaceId: 'demo-workspace',
      message: { id: 'm1', role: 'user', content: 'hi' },
      model: { provider: 'openai', id: 'gpt-4.1-mini' }
    })
    expect(reqResult.ok).toBe(true)

    const headerResult = validateRequestHeaders({
      'X-Sidechat-Protocol': 'sidechat.v1',
      'Content-Type': 'application/json'
    } as Record<string, string>)
    expect(headerResult.ok).toBe(true)

    const eventResult = validateStreamEvent({
      type: 'sidechat.started',
      requestId: 'req-1',
      conversationId: 'c1',
      messageId: 'm1',
      model: { provider: 'openai', id: 'gpt-4.1-mini' }
    })
    expect(eventResult.ok).toBe(true)

    const badEventResult = validateStreamEvent({ type: 'sidechat.unknown' } as unknown)
    expect(badEventResult.ok).toBe(false)
  })
})
