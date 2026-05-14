export * from './sidechat.v1/types'
export * from './sidechat.v1/schemas'
export * from './sidechat.v1/codec'
export * from './sidechat.v1/sequence'
export * from './sidechat.v1/contracts'

import {
  SidechatStreamCompletedEvent,
  SidechatStreamDeltaEvent,
  SidechatStreamEvent,
  SidechatStreamErrorEvent,
  SidechatStreamHistoryEvent,
  SidechatStreamStartEvent,
  SidechatProtocolVersion
} from './sidechat.v1/types'
import { encodeSseFrame, encodeSseEvent, parseSseEvent, protocolLinePrefix } from './sidechat.v1/codec'
import { SidechatRequestSchema } from './sidechat.v1/schemas'
import { readFileSync } from 'node:fs'

export const protocolVersion = SidechatProtocolVersion
export const streamRequestSchema = SidechatRequestSchema
export const encodeSse = encodeSseEvent
export const encodeSseEventFrame = encodeSseFrame
export const parseSse = parseSseEvent

const parseGoldenFixture = (fixture: string): SidechatStreamEvent[] => {
  try {
    const payload = JSON.parse(readFileSync(new URL(fixture, import.meta.url), 'utf8')) as {
      events?: SidechatStreamEvent[]
      protocol?: string
    }
    return Array.isArray(payload.events) ? payload.events : []
  } catch {
    return []
  }
}

export const goldenSuccessEvents = parseGoldenFixture('./sidechat.v1/fixtures/success-stream.json')
export const goldenErrorEvents = parseGoldenFixture('./sidechat.v1/fixtures/error-stream.json')

export { parseSseEvent }
export const parseSseFrames = (chunk: string): SidechatStreamEvent[] =>
  chunk
    .split(protocolLinePrefix)
    .filter(Boolean)
    .map((segment) => {
      const payload = segment.startsWith(' ') ? segment.slice(1) : segment
      return parseSseEvent(`${protocolLinePrefix} ${payload}`)
    })
    .filter((event): event is SidechatStreamEvent => event !== undefined)

export type {
  SidechatStreamStartEvent,
  SidechatStreamDeltaEvent,
  SidechatStreamCompletedEvent,
  SidechatStreamErrorEvent,
  SidechatStreamHistoryEvent
}
export * from './sidechat.v1/validation'
