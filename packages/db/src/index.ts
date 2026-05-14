import type { Pool } from 'pg'
import type { ChatMessage, ModelSelection, TokenUsage } from '@side-chat/shared-protocol'

export type DbExecutor = Pick<Pool, 'query'>
export type ConversationRow = { conversation_id: string }
export type HistoryRow = ChatMessage

export class SideChatDb {
  constructor(private readonly db: DbExecutor) {}

  createOrGetConversation(workspaceId: string, userId: string, conversationId?: string) {
    return this.db.query<ConversationRow>('select * from sidechat_create_or_get_conversation($1, $2, $3)', [workspaceId, userId, conversationId ?? null])
  }

  appendUserMessage(conversationId: string, messageId: string, content: string) {
    return this.db.query('select * from sidechat_append_user_message($1, $2, $3)', [conversationId, messageId, content])
  }

  appendAssistantMessage(conversationId: string, messageId: string, content: string, model: ModelSelection) {
    return this.db.query('select * from sidechat_append_assistant_message($1, $2, $3, $4, $5)', [conversationId, messageId, content, model.provider, model.id])
  }

  readSeededHistory(workspaceId: string, conversationId: string) {
    return this.db.query<HistoryRow>('select * from sidechat_read_seeded_history($1, $2)', [workspaceId, conversationId])
  }

  recordUsage(requestId: string, conversationId: string, messageId: string, model: ModelSelection, usage: TokenUsage) {
    return this.db.query('select * from sidechat_record_usage($1, $2, $3, $4, $5, $6, $7, $8)', [requestId, conversationId, messageId, model.provider, model.id, usage.inputTokens, usage.outputTokens, usage.totalTokens])
  }
}
