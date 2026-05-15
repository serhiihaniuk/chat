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
})
