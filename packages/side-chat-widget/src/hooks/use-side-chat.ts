import { useCallback, useState } from 'react'
import { useEffect } from 'react'
import {
  parseSsePayload,
  protocolVersion,
  SidechatStreamEventSchema,
  type ModelSelection,
  type SidechatStreamErrorEvent,
  type SidechatStreamEvent,
  type TokenUsage
} from '@side-chat/shared-protocol'

export type SideChatError = SidechatStreamErrorEvent

export type UseSideChatOptions = {
  apiEndpoint: string
  workspaceId: string
  initialConversationId?: string
  historyEndpoint?: string
  defaultModel: ModelSelection
  onError?: (error: SideChatError) => void
  onUsage?: (usage: TokenUsage) => void
}

export type WidgetMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

const randomId = () => `client-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`

const deriveHistoryEndpoint = (apiEndpoint: string): string => {
  const streamSuffix = '/chat/stream'
  if (apiEndpoint.endsWith(streamSuffix)) {
    return `${apiEndpoint.slice(0, -streamSuffix.length)}/chat/history`
  }

  return `${apiEndpoint}/chat/history`
}

const requestError = (message: string, requestId: string): SideChatError => ({
  type: 'sidechat.error',
  requestId,
  code: 'REQUEST_FAILED',
  message,
  retryable: true
})

const knownEventTypes = new Set([
  'sidechat.started',
  'sidechat.delta',
  'sidechat.completed',
  'sidechat.error',
  'sidechat.history'
])

const parseKnownFramePayload = (data: string): SidechatStreamEvent | undefined => {
  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    return undefined
  }

  const parsed = SidechatStreamEventSchema.safeParse(json)
  return parsed.success ? parsed.data : undefined
}

export const readSideChatStreamEvents = async (
  response: globalThis.Response,
  onEvent: (event: SidechatStreamEvent) => void,
  onMalformedEvent?: (message: string) => void
): Promise<void> => {
  const emit = (chunk: string) => {
    for (const payload of parseSsePayload(chunk)) {
      if (payload.event && !knownEventTypes.has(payload.event)) {
        continue
      }

      const parsed = parseKnownFramePayload(payload.data)
      if (parsed) {
        onEvent(parsed)
        continue
      }

      onMalformedEvent?.(`Malformed ${payload.event ?? 'sidechat'} stream event`)
    }
  }

  if (!response.body) {
    emit(await response.text())
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''

  const flushCompleteFrames = () => {
    for (;;) {
      const boundary = pending.indexOf('\n\n')
      if (boundary === -1) return

      const frame = pending.slice(0, boundary + 2)
      pending = pending.slice(boundary + 2)
      emit(frame)
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    pending += decoder.decode(value, { stream: true })
    flushCompleteFrames()
  }

  pending += decoder.decode()
  if (pending.trim()) {
    emit(pending.endsWith('\n\n') ? pending : `${pending}\n\n`)
  }
}

export function useSideChat(options: UseSideChatOptions) {
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<SideChatError | undefined>()
  const [usage, setUsage] = useState<TokenUsage | undefined>()
  const [model, setModel] = useState(options.defaultModel)
  const [lastUserMessage, setLastUserMessage] = useState<string | undefined>()
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const historyEndpoint = options.historyEndpoint ?? deriveHistoryEndpoint(options.apiEndpoint)

  useEffect(() => {
    if (!options.initialConversationId) return

    let aborted = false
    const conversationId = options.initialConversationId
    const loadHistory = async () => {
      try {
        setIsLoadingHistory(true)
        const response = await fetch(`${historyEndpoint}?workspaceId=${encodeURIComponent(options.workspaceId)}&conversationId=${encodeURIComponent(conversationId)}`)

        if (!response.ok) {
          throw new Error(`History load failed: ${response.status}`)
        }

        const payload = await response.json() as { messages: Array<{ id: string; role: string; content: string }> }
        if (aborted) return
        setMessages(payload.messages.map((message) => ({
          id: message.id,
          role: message.role === 'assistant' || message.role === 'user' || message.role === 'system'
            ? message.role
            : 'system',
          content: message.content
        })))
      } catch (unknownError) {
        if (aborted) return
        const historyError = requestError(
          unknownError instanceof Error ? unknownError.message : 'Failed to load conversation history',
          'history-load'
        )
        setError(historyError)
        options.onError?.(historyError)
      } finally {
        if (!aborted) {
          setIsLoadingHistory(false)
        }
      }
    }

    void loadHistory()

    return () => {
      aborted = true
      setIsLoadingHistory(false)
    }
  }, [historyEndpoint, options.initialConversationId, options.onError, options.workspaceId])

  const handleEvent = useCallback((event: SidechatStreamEvent) => {
    if (event.type === 'sidechat.started') {
      setMessages((current) => [
        ...current,
        { id: event.messageId, role: 'assistant', content: '' }
      ])
      return
    }

    if (event.type === 'sidechat.delta') {
      setMessages((current) => current.map((message) => (
        message.id === event.messageId
          ? { ...message, content: message.content + event.content }
          : message
      )))
      return
    }

    if (event.type === 'sidechat.completed') {
      setUsage(event.usage)
      options.onUsage?.(event.usage)
      return
    }

    if (event.type === 'sidechat.error') {
      setError(event)
      options.onError?.(event)
      return
    }

    setMessages(event.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content
    })))
  }, [options])

  const sendMessage = useCallback(async (content: string, optionsParam?: { isRetry?: boolean }) => {
    const trimmed = content.trim()
    if (!trimmed || isStreaming) return

    const requestId = randomId()
    const messageId = randomId()
    if (!optionsParam?.isRetry) {
      setMessages((current) => [
        ...current,
        { id: messageId, role: 'user', content: trimmed }
      ])
    }

    setError(undefined)
    setLastUserMessage(trimmed)
    setIsStreaming(true)

    try {
      const response = await fetch(options.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'X-Sidechat-Protocol': protocolVersion,
          'X-Request-Id': requestId
        },
        body: JSON.stringify({
          workspaceId: options.workspaceId,
          conversationId: options.initialConversationId,
          message: { id: messageId, role: 'user', content: trimmed },
          model
        })
      })

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`)
      }

      await readSideChatStreamEvents(response, handleEvent, (message) => {
        throw new Error(message)
      })
    } catch (unknownError) {
      const nextError = requestError(
        unknownError instanceof Error ? unknownError.message : 'Chat request failed',
        requestId
      )
      setError(nextError)
      options.onError?.(nextError)
    } finally {
      setIsStreaming(false)
    }
  }, [handleEvent, isStreaming, model, options])

  const retryLastMessage = useCallback(() => {
    if (!lastUserMessage) return
    void sendMessage(lastUserMessage, { isRetry: true })
  }, [lastUserMessage, sendMessage])

  return {
    messages,
    isStreaming,
    error,
    usage,
    model,
    setModel,
    sendMessage,
    retryLastMessage,
    isHistoryLoading: isLoadingHistory
  }
}
