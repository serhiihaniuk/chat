import type { SidechatStreamEvent } from './types.js'
import { isTerminalSidechatEvent } from './codec.js'

export type SequenceValidation =
  | { ok: true }
  | {
      ok: false
      code:
        | 'empty'
        | 'missing_terminal_event'
        | 'multiple_terminal_events'
        | 'delta_after_terminal'
        | 'multiple_started_events'
        | 'terminal_request_id_missing'
        | 'terminal_request_mismatch'
      message: string
    }

export const validateSidechatEventSequence = (events: SidechatStreamEvent[]): SequenceValidation => {
  if (events.length === 0) {
    return {
      ok: false,
      code: 'empty',
      message: 'event sequence must not be empty'
    }
  }

  const terminalIndices = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => isTerminalSidechatEvent(event))
    .map(({ index }) => index)

  if (terminalIndices.length === 0) {
    return {
      ok: false,
      code: 'missing_terminal_event',
      message: 'stream must emit one terminal event'
    }
  }

  if (terminalIndices.length > 1) {
    return {
      ok: false,
      code: 'multiple_terminal_events',
      message: 'stream must emit exactly one terminal event'
    }
  }

  const terminalIndex = terminalIndices.at(0)
  if (terminalIndex !== undefined) {
    for (let i = terminalIndex + 1; i < events.length; i += 1) {
      if (events[i].type === 'sidechat.delta') {
        return {
          ok: false,
          code: 'delta_after_terminal',
          message: 'delta event after terminal event is invalid'
        }
      }
    }

    const terminalEvent = events[terminalIndex]
    if (!terminalEvent.requestId) {
      return {
        ok: false,
        code: 'terminal_request_id_missing',
        message: 'terminal event requires requestId'
      }
    }

    const bad = events
      .slice(0, terminalIndex)
      .find((event) => event.requestId !== terminalEvent.requestId)
    if (bad) {
      return {
        ok: false,
        code: 'terminal_request_mismatch',
        message: 'terminal requestId must match all prior stream events'
      }
    }

    const [firstStarted, ...restStarted] = events.filter((event) => event.type === 'sidechat.started')
    if (events.indexOf(firstStarted) > terminalIndex) {
      return {
        ok: false,
        code: 'delta_after_terminal',
        message: 'started cannot appear after terminal event'
      }
    }

    if (restStarted.length > 0) {
      return {
        ok: false,
        code: 'multiple_started_events',
        message: 'started event must be unique'
      }
    }
  }

  return { ok: true }
}
