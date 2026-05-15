import { Pool } from 'pg'
import type { ChatMessage, ModelSelection, TokenUsage } from '@side-chat/shared-protocol'

export interface DbExecutor { query<T extends object = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> }
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

export type SideChatPersistence = {
  conversations: {
    createOrGet(input: { workspaceId: string; userId: string; conversationId?: string }): Promise<string>
    appendUserMessage(conversationId: string, messageId: string, content: string): Promise<void>
    appendAssistantMessage(conversationId: string, messageId: string, content: string, model: ModelSelection): Promise<void>
  }
  usage: {
    record(input: { requestId: string; conversationId: string; messageId: string; model: ModelSelection; usage: TokenUsage }): Promise<void>
  }
  close(): Promise<void>
}

export const createSideChatPersistence = (executor: DbExecutor, close: () => Promise<void> = async () => {}): SideChatPersistence => {
  const db = new SideChatDb(executor)

  return {
    conversations: {
      async createOrGet({ workspaceId, userId, conversationId }) {
        const result = await db.createOrGetConversation(workspaceId, userId, conversationId)
        const id = result.rows[0]?.conversation_id
        if (!id) throw new Error('sidechat_create_or_get_conversation returned no conversation_id')
        return id
      },
      async appendUserMessage(conversationId, messageId, content) {
        await db.appendUserMessage(conversationId, messageId, content)
      },
      async appendAssistantMessage(conversationId, messageId, content, model) {
        await db.appendAssistantMessage(conversationId, messageId, content, model)
      }
    },
    usage: {
      async record({ requestId, conversationId, messageId, model, usage }) {
        await db.recordUsage(requestId, conversationId, messageId, model, usage)
      }
    },
    close
  }
}

export const createPostgresSideChatPersistence = (connectionString: string): SideChatPersistence => {
  const pool = new Pool({ connectionString })
  return createSideChatPersistence(pool, () => pool.end())
}
