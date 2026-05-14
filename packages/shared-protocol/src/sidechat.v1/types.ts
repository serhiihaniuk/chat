export const SidechatProtocolVersion = 'sidechat.v1' as const
export type Role = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: Role
  content: string
}

export interface ModelSelection {
  provider: string
  id: string
}

export interface SidechatStreamStartEvent {
  type: 'sidechat.started'
  requestId: string
  conversationId: string
  messageId: string
  model: ModelSelection
}

export interface SidechatStreamDeltaEvent {
  type: 'sidechat.delta'
  requestId: string
  messageId: string
  content: string
  index: number
}

export interface SidechatStreamCompletedEvent {
  type: 'sidechat.completed'
  requestId: string
  conversationId: string
  messageId: string
  model: ModelSelection
  finishReason: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export interface SidechatStreamErrorEvent {
  type: 'sidechat.error'
  requestId: string
  code: string
  message: string
  retryable: boolean
}

export interface SidechatStreamHistoryEvent {
  type: 'sidechat.history'
  requestId: string
  conversationId: string
  messages: ChatMessage[]
}

export type SidechatStreamEvent =
  | SidechatStreamStartEvent
  | SidechatStreamDeltaEvent
  | SidechatStreamCompletedEvent
  | SidechatStreamErrorEvent
  | SidechatStreamHistoryEvent

export interface SidechatRequest {
  workspaceId: string
  conversationId?: string
  message: ChatMessage
  model: ModelSelection
}

export interface SidechatRequestHeaders {
  protocol: 'sidechat.v1'
  requestId?: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}
