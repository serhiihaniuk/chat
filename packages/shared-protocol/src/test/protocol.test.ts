import { describe, expect, it } from 'vitest'
import { encodeSse, goldenSuccessEvents, parseSseFrames, protocolVersion, streamRequestSchema } from '../index.js'

describe('sidechat protocol', () => {
  it('validates required request fields', () => {
    expect(() => streamRequestSchema.parse({ workspaceId: 'demo-workspace', message: { id: 'm1', role: 'user', content: 'hi' }, model: { provider: 'openai', id: 'gpt-4.1-mini' } })).not.toThrow()
    expect(() => streamRequestSchema.parse({ workspaceId: '', message: { id: 'm1', role: 'user', content: '' }, model: { provider: 'openai', id: '' } })).toThrow()
  })

  it('round trips golden SSE frames with one terminal event', () => {
    const parsed = parseSseFrames(goldenSuccessEvents.map(encodeSse).join(''))
    expect(protocolVersion).toBe('sidechat.v1')
    expect(parsed.map((event) => event.type)).toEqual(['sidechat.started', 'sidechat.delta', 'sidechat.delta', 'sidechat.completed'])
    expect(parsed.filter((event) => event.type === 'sidechat.completed' || event.type === 'sidechat.error')).toHaveLength(1)
  })
})
