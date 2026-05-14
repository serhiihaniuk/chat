import { describe, expect, it } from 'vitest'
import type { SideChatWidgetProps } from '../index.js'

describe('widget public api', () => {
  it('requires host-safe endpoint and workspace props', () => {
    const props = { apiEndpoint: '/chat/stream', workspaceId: 'demo-workspace' } satisfies SideChatWidgetProps
    expect(props.apiEndpoint).toBe('/chat/stream')
  })
})
