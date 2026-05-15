import { describe, expect, it } from 'vitest'
import { encodeSseEventFrame, type SidechatStreamEvent } from '@side-chat/shared-protocol'
import { readSideChatStreamEvents } from '../hooks/use-side-chat.js'

const started: SidechatStreamEvent = {
  type: 'sidechat.started',
  requestId: 'req-1',
  conversationId: 'conv-1',
  messageId: 'assistant-1',
  model: { provider: 'openai', id: 'gpt-4.1-mini' }
}

const completed: SidechatStreamEvent = {
  type: 'sidechat.completed',
  requestId: 'req-1',
  conversationId: 'conv-1',
  messageId: 'assistant-1',
  model: { provider: 'openai', id: 'gpt-4.1-mini' },
  finishReason: 'stop',
  usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
}

describe('readSideChatStreamEvents', () => {
  it('emits complete SSE frames while the response body is still streaming', async () => {
    const encoder = new TextEncoder()
    const seen: string[] = []
    let streamFinished = false

    let releaseSecondFrame!: () => void
    const secondFrameReady = new Promise<void>((resolve) => {
      releaseSecondFrame = resolve
    })

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`${encodeSseEventFrame(started)}\n`))
        void secondFrameReady.then(() => {
          controller.enqueue(encoder.encode(`${encodeSseEventFrame(completed)}\n`))
          controller.close()
        })
      }
    })

    const reading = readSideChatStreamEvents(new Response(body), (event) => {
      seen.push(event.type)
    }).then(() => {
      streamFinished = true
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(streamFinished).toBe(false)
    expect(seen).toEqual(['sidechat.started'])

    releaseSecondFrame()
    await reading
    expect(seen).toEqual(['sidechat.started', 'sidechat.completed'])
  })
})
