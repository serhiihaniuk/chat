import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import type { ModelPort } from '../../ports/index.js'

export const openAiModelAdapter: ModelPort = {
  async *stream(request, signal) {
    const result = streamText({ model: openai(request.model.id), prompt: request.message.content, abortSignal: signal })
    for await (const textPart of result.textStream) yield { kind: 'delta', text: textPart }
    const usage = await result.usage
    yield { kind: 'done', finishReason: 'stop', usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, totalTokens: usage.totalTokens ?? 0 } }
  }
}
