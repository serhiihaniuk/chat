import { useCallback, useState } from 'react'
import {
  parseKnownSsePayloads,
  protocolVersion,
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

const requestError = (message: string, requestId: string): SideChatError => ({
  type: 'sidechat.error',
  requestId,
  code: 'REQUEST_FAILED',
  message,
  retryable: true
})

const readStreamEvents = async (response: Response): Promise<SidechatStreamEvent[]> => {
  if (!response.body) {
    return parseKnownSsePayloads(await response.text())
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const events: SidechatStreamEvent[] = []
  let pending = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    pending += decoder.decode(value, { stream: true })
    const completeBoundary = pending.lastIndexOf('\n\n')
    if (completeBoundary === -1) continue

    const complete = pending.slice(0, completeBoundary + 2)
    pending = pending.slice(completeBoundary + 2)
    events.push(...parseKnownSsePayloads(complete))
  }

  pending += decoder.decode()
  if (pending.trim()) {
    events.push(...parseKnownSsePayloads(pending.endsWith('\n\n') ? pending : `${pending}\n\n`))
  }

  return events
}

export function useSideChat(options: UseSideChatOptions) {
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<SideChatError | undefined>()
  const [usage, setUsage] = useState<TokenUsage | undefined>()
  const [model, setModel] = useState(options.defaultModel)

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

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed || isStreaming) return

    const requestId = randomId()
    const messageId = randomId()
    setMessages((current) => [
      ...current,
      { id: messageId, role: 'user', content: trimmed }
    ])
    setError(undefined)
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

      const events = await readStreamEvents(response)
      for (const event of events) {
        handleEvent(event)
      }
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

  return { messages, isStreaming, error, usage, model, setModel, sendMessage }
}
