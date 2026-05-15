import type { ModelPort } from '../../ports/index.js'

export const fakeModelAdapter: ModelPort = {
  async *stream(request) {
    if (request.message.content.toLowerCase().includes('fail')) throw new Error('fake model failure')
    yield { kind: 'delta', text: '# Assistant answer\n' }
    yield { kind: 'delta', text: `Model **${request.model.id}** received: ${request.message.content}\n` }
    yield { kind: 'delta', text: '- deterministic mocked streaming\n- markdown-ready output\n' }
    yield { kind: 'delta', text: 'Here is `inline code` and a block:\n' }
    yield { kind: 'delta', text: '```\nconst x = 1;\n```\n' }
    yield { kind: 'done', finishReason: 'stop', usage: { inputTokens: request.message.content.split(/\s+/).filter(Boolean).length, outputTokens: 18, totalTokens: request.message.content.split(/\s+/).filter(Boolean).length + 18 } }
  }
}
