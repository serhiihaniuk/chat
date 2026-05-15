import { SidechatProtocolVersion } from './types.js'
import type {
  SidechatStreamEvent,
  SidechatStreamErrorEvent,
  SidechatStreamCompletedEvent,
  SidechatStreamStartEvent,
  SidechatStreamDeltaEvent,
  SidechatStreamHistoryEvent
} from './types.js'
import { SidechatStreamEventSchema } from './schemas.js'

export const protocolLinePrefix = 'data:'

const startsWithPrefix = (line: string): boolean => line.startsWith(`${protocolLinePrefix} `)

export const encodeSseEvent = (event: SidechatStreamEvent): string => {
  const payload = JSON.stringify(event)
  return `${protocolLinePrefix} ${payload}`
}

export const parseSseEvent = (line: string): SidechatStreamEvent | undefined => {
  if (!startsWithPrefix(line)) return undefined

  const json = line.slice(protocolLinePrefix.length + 1).trimStart()
  if (!json) return undefined

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(json)
  } catch {
    return undefined
  }

  const parsed = SidechatStreamEventSchema.safeParse(parsedJson)
  if (!parsed.success) return undefined

  return parsed.data
}

export const isTerminalSidechatEvent = (event: SidechatStreamEvent): event is SidechatStreamCompletedEvent | SidechatStreamErrorEvent => {
  return event.type === 'sidechat.completed' || event.type === 'sidechat.error'
}

export const isDeltaSidechatEvent = (event: SidechatStreamEvent): event is SidechatStreamDeltaEvent => {
  return event.type === 'sidechat.delta'
}

export const isHistorySidechatEvent = (event: SidechatStreamEvent): event is SidechatStreamHistoryEvent => {
  return event.type === 'sidechat.history'
}

export const isStartedSidechatEvent = (event: SidechatStreamEvent): event is SidechatStreamStartEvent => {
  return event.type === 'sidechat.started'
}

export const protocolFrame = {
  protocol: SidechatProtocolVersion,
  headers: {
    protocol: 'X-Sidechat-Protocol',
    requestId: 'X-Request-Id'
  }
} as const

export const encodeSseFrame = (event: SidechatStreamEvent): string => [
  `event: ${event.type}`,
  encodeSseEvent(event),
  ''
].join('\n')

export interface ParsedSsePayload {
  event?: string
  data: string
}

export const parseSsePayload = (chunk: string): ParsedSsePayload[] => {
  const blocks = chunk.split('\n\n')
  const out: ParsedSsePayload[] = []

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue

    const lines = trimmed.split('\n')
    const payload: ParsedSsePayload = { data: '' }

    for (const line of lines) {
      if (!line || line.startsWith(':')) {
        continue
      }

      if (line.startsWith('event:')) {
        payload.event = line.slice('event:'.length).trim()
        continue
      }

      if (line.startsWith('data:')) {
        payload.data = payload.data ? `${payload.data}\n${line.slice('data:'.length).trimStart()}` : line.slice('data:'.length).trimStart()
        continue
      }
    }

    if (payload.data) {
      out.push(payload)
    }
  }

  return out
}

export const parseKnownSsePayloads = (chunk: string): SidechatStreamEvent[] => {
  const payloads = parseSsePayload(chunk)
  const out: SidechatStreamEvent[] = []

  for (const payload of payloads) {
    if (payload.event && payload.event !== 'sidechat.started' && payload.event !== 'sidechat.delta' && payload.event !== 'sidechat.completed' && payload.event !== 'sidechat.error' && payload.event !== 'sidechat.history') {
      continue
    }

    const parsed = parseSseEvent(`${protocolLinePrefix} ${payload.data}`)
    if (parsed) {
      out.push(parsed)
    }
  }

  return out
}
