import { describe, expect, it } from 'vitest'
import { parseSseFrames, protocolVersion } from '@side-chat/shared-protocol'
import { createApp } from '../src/inbound/hono/app.js'

describe('hono adapter', () => {
  it('serves health and models', async () => {
    const app = createApp()
    expect(await (await app.request('/health')).json()).toEqual({ ok: true })
    expect((await (await app.request('/models')).json()).models).toHaveLength(2)
  })

  it('streams sidechat.v1 events without provider tokens', async () => {
    delete process.env.OPENAI_API_KEY
    const response = await createApp().request('/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-Sidechat-Protocol': protocolVersion, 'X-Request-Id': 'req-test' }, body: JSON.stringify({ workspaceId: 'demo-workspace', conversationId: 'demo-conversation-001', message: { id: 'client-msg-001', role: 'user', content: 'Explain this report' }, model: { provider: 'openai', id: 'gpt-4.1-mini' } }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Sidechat-Protocol')).toBe(protocolVersion)
    const frames = parseSseFrames(await response.text())
    expect(frames.at(0)?.type).toBe('sidechat.started')
    expect(frames.at(-1)?.type).toBe('sidechat.completed')
  })
})
