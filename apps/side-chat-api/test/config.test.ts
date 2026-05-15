import { describe, expect, it } from 'vitest'
import { parseSideChatEnv } from '../src/inbound/hono/config.js'

describe('side-chat env parser', () => {
  it('defaults to fake model when USE_FAKE_MODEL is unset', () => {
    expect(parseSideChatEnv({} as NodeJS.ProcessEnv).USE_FAKE_MODEL).toBe(true)
    expect(parseSideChatEnv({} as NodeJS.ProcessEnv).SIDE_CHAT_DEFAULT_USER_ID).toBe('local-user')
  })

  it('treats USE_FAKE_MODEL=false as an explicit switch to non-fake', () => {
    const env = parseSideChatEnv({ USE_FAKE_MODEL: 'false', SIDE_CHAT_MODEL_ADAPTER: 'openai', OPENAI_API_KEY: 'abc' } as NodeJS.ProcessEnv)
    expect(env.USE_FAKE_MODEL).toBe(false)
    expect(env.SIDE_CHAT_MODEL_ADAPTER).toBe('openai')
    expect(env.OPENAI_API_KEY).toBe('abc')
  })

  it('falls back to defaults for malformed truthy values', () => {
    const env = parseSideChatEnv({ USE_FAKE_MODEL: 'maybe' } as NodeJS.ProcessEnv)
    expect(env.USE_FAKE_MODEL).toBe(true)
  })

  it('supports explicit boundary controls', () => {
    const env = parseSideChatEnv({
      SIDE_CHAT_ALLOWED_WORKSPACE_IDS: 'demo-workspace,alpha',
      SIDE_CHAT_BLOCKED_WORKSPACE_IDS: 'blocked',
      SIDE_CHAT_RATE_LIMITING_ENABLED: 'false',
      SIDE_CHAT_BILLING_ENABLED: 'false'
    } as NodeJS.ProcessEnv)

    expect(env.SIDE_CHAT_ALLOWED_WORKSPACE_IDS).toBe('demo-workspace,alpha')
    expect(env.SIDE_CHAT_BLOCKED_WORKSPACE_IDS).toBe('blocked')
    expect(env.SIDE_CHAT_RATE_LIMITING_ENABLED).toBe(false)
    expect(env.SIDE_CHAT_BILLING_ENABLED).toBe(false)
  })
})
