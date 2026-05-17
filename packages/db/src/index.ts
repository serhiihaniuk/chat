import { Pool } from "pg";
import type {
  ChatMessage,
  ModelSelection,
  TokenUsage,
} from "@side-chat/shared-protocol";
export {
  AdvisoryDashboardDb,
  createPostgresAdvisoryDashboardDb,
} from "./advisory-dashboard.js";
export type {
  AdvisoryDashboardSnapshot,
  AdvisoryKpi,
  AdvisoryKpiTrend,
  ClientPortfolioReviewRow,
  NetNewMoneyTrendPoint,
  ProductAllocationRow,
  RiskDriverExposureRow,
  RiskExposureTrendPoint,
  SegmentRiskScoreRow,
  TopRiskAccountRow,
} from "./advisory-dashboard.types.js";

export interface DbExecutor {
  query<T extends object = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export type ConversationRow = { conversation_id: string };
export type HistoryRow = ChatMessage;
export type UsageRow = TokenUsage;
export type ResetConversationHistoryRow = { deletedMessages: number };
export type ResetConversationUsageRow = { deletedUsageRecords: number };

/**
 * Thin stored-procedure adapter for side-chat persistence. Application code
 * calls methods here instead of writing table SQL in runtime services.
 */
export class SideChatDb {
  constructor(private readonly db: DbExecutor) {}

  createOrGetConversation(
    workspaceId: string,
    userId: string,
    conversationId?: string,
  ) {
    return this.db.query<ConversationRow>(
      "select * from sidechat_create_or_get_conversation($1, $2, $3)",
      [workspaceId, userId, conversationId ?? null],
    );
  }

  appendUserMessage(
    conversationId: string,
    messageId: string,
    content: string,
  ) {
    return this.db.query(
      "select * from sidechat_append_user_message($1, $2, $3)",
      [conversationId, messageId, content],
    );
  }

  appendAssistantMessage(
    conversationId: string,
    messageId: string,
    content: string,
    model: ModelSelection,
    metadata: Record<string, unknown> = {},
  ) {
    return this.db.query(
      "select * from sidechat_append_assistant_message($1, $2, $3, $4, $5, $6)",
      [conversationId, messageId, content, model.provider, model.id, metadata],
    );
  }

  readSeededHistory(workspaceId: string, conversationId: string) {
    return this.db.query<HistoryRow>(
      "select * from sidechat_read_seeded_history($1, $2)",
      [workspaceId, conversationId],
    );
  }

  resetConversationHistory(
    workspaceId: string,
    userId: string,
    conversationId: string,
  ) {
    return this.db.query<ResetConversationHistoryRow>(
      "select * from sidechat_reset_conversation_history($1, $2, $3)",
      [workspaceId, userId, conversationId],
    );
  }

  recordUsage(
    requestId: string,
    conversationId: string,
    messageId: string,
    model: ModelSelection,
    usage: TokenUsage,
  ) {
    return this.db.query(
      "select * from sidechat_record_usage($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
      [
        requestId,
        conversationId,
        messageId,
        model.provider,
        model.id,
        usage.inputTokens,
        usage.outputTokens,
        usage.totalTokens,
        usage.reasoningTokens ?? null,
        usage.cachedInputTokens ?? null,
        usage.cacheWriteTokens ?? null,
        usage.estimatedCostUsd ?? null,
      ],
    );
  }

  getLatestUsage(workspaceId: string, userId: string, conversationId: string) {
    return this.db.query<UsageRow>(
      "select * from sidechat_get_latest_usage($1, $2, $3)",
      [workspaceId, userId, conversationId],
    );
  }

  resetConversationUsage(
    workspaceId: string,
    userId: string,
    conversationId: string,
  ) {
    return this.db.query<ResetConversationUsageRow>(
      "select * from sidechat_reset_conversation_usage($1, $2, $3)",
      [workspaceId, userId, conversationId],
    );
  }
}

export type SideChatPersistence = {
  conversations: {
    createOrGet(input: {
      workspaceId: string;
      userId: string;
      conversationId?: string;
    }): Promise<string>;
    appendUserMessage(
      conversationId: string,
      messageId: string,
      content: string,
    ): Promise<void>;
    appendAssistantMessage(
      conversationId: string,
      messageId: string,
      content: string,
      model: ModelSelection,
      metadata?: Record<string, unknown>,
    ): Promise<void>;
    readSeededHistory(
      workspaceId: string,
      conversationId: string,
    ): Promise<HistoryRow[]>;
    resetHistory(input: {
      workspaceId: string;
      userId: string;
      conversationId: string;
    }): Promise<ResetConversationHistoryRow>;
  };
  usage: {
    record(input: {
      requestId: string;
      conversationId: string;
      messageId: string;
      model: ModelSelection;
      usage: TokenUsage;
    }): Promise<void>;
    latest(input: {
      workspaceId: string;
      userId: string;
      conversationId: string;
    }): Promise<TokenUsage | undefined>;
    reset(input: {
      workspaceId: string;
      userId: string;
      conversationId: string;
    }): Promise<ResetConversationUsageRow>;
  };
  close(): Promise<void>;
};

/**
 * Port-shaped persistence facade consumed by side-chat-api. This hides raw
 * query rows and exposes the repository methods the application use case needs.
 */
export const createSideChatPersistence = (
  executor: DbExecutor,
  close: () => Promise<void> = async () => {},
): SideChatPersistence => {
  const db = new SideChatDb(executor);

  return {
    conversations: {
      async createOrGet({ workspaceId, userId, conversationId }) {
        const result = await db.createOrGetConversation(
          workspaceId,
          userId,
          conversationId,
        );
        const id = result.rows[0]?.conversation_id;
        if (!id)
          throw new Error(
            "sidechat_create_or_get_conversation returned no conversation_id",
          );
        return id;
      },
      async appendUserMessage(conversationId, messageId, content) {
        await db.appendUserMessage(conversationId, messageId, content);
      },
      async appendAssistantMessage(
        conversationId,
        messageId,
        content,
        model,
        metadata,
      ) {
        await db.appendAssistantMessage(
          conversationId,
          messageId,
          content,
          model,
          metadata,
        );
      },
      async readSeededHistory(workspaceId, conversationId) {
        const result = await db.readSeededHistory(workspaceId, conversationId);
        return result.rows;
      },
      async resetHistory({ workspaceId, userId, conversationId }) {
        const result = await db.resetConversationHistory(
          workspaceId,
          userId,
          conversationId,
        );
        return result.rows[0] ?? { deletedMessages: 0 };
      },
    },
    usage: {
      async record({ requestId, conversationId, messageId, model, usage }) {
        await db.recordUsage(
          requestId,
          conversationId,
          messageId,
          model,
          usage,
        );
      },
      async latest({ workspaceId, userId, conversationId }) {
        const result = await db.getLatestUsage(
          workspaceId,
          userId,
          conversationId,
        );
        return result.rows[0];
      },
      async reset({ workspaceId, userId, conversationId }) {
        const result = await db.resetConversationUsage(
          workspaceId,
          userId,
          conversationId,
        );
        return result.rows[0] ?? { deletedUsageRecords: 0 };
      },
    },
    close,
  };
};

export const createPostgresSideChatPersistence = (
  connectionString: string,
): SideChatPersistence => {
  const pool = new Pool({ connectionString });
  return createSideChatPersistence(pool, () => pool.end());
};

export const createDbFromUrl = (connectionString: string): SideChatDb =>
  new SideChatDb(new Pool({ connectionString }));
