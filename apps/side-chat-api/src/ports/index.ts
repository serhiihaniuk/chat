import type { ModelSelection, SideChatStreamEvent, StreamRequest, TokenUsage } from '@side-chat/shared-protocol'

export type ModelChunk = { kind: 'delta'; text: string } | { kind: 'done'; finishReason: string; usage: TokenUsage }
export interface ModelPort { stream(request: StreamRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> }
export interface ConversationRepository { createOrGet(input: { workspaceId: string; userId: string; conversationId?: string }): Promise<string>; appendUserMessage(conversationId: string, messageId: string, content: string): Promise<void>; appendAssistantMessage(conversationId: string, messageId: string, content: string, model: ModelSelection): Promise<void> }
export interface UsagePort { record(input: { requestId: string; conversationId: string; messageId: string; model: ModelSelection; usage: TokenUsage }): Promise<void> }
export interface AuthPort { authorize(workspaceId: string, userId: string): Promise<boolean> }
export interface RateLimitPort { check(workspaceId: string, userId: string): Promise<boolean> }
export interface BillingPort { allow(workspaceId: string): Promise<boolean> }
export interface ObservabilityPort { lifecycle(event: SideChatStreamEvent): void; counter(name: string, tags?: Record<string, string>): void; span<T>(name: string, run: () => Promise<T>): Promise<T> }
export interface ConfigPort { models(): ModelSelection[]; defaultUserId(): string }
