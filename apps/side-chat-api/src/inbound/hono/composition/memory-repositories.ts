import type { ModelSelection, TokenUsage } from "@side-chat/shared-protocol";

import type {
  ConversationRepository,
  ModelPort,
  UsagePort,
} from "#ports/index.js";

/**
 * In-memory adapters for tests and local fallback. They implement the same
 * ports as Postgres-backed repositories without changing application code.
 */
export const createMemoryConversationRepository =
  (): ConversationRepository => {
    const messages = new Map<
      string,
      {
        role: "user" | "assistant";
        messageId: string;
        content: string;
        model?: ModelSelection;
        metadata?: Record<string, unknown>;
      }[]
    >();

    return {
      async createOrGet({ conversationId }) {
        const id = conversationId ?? crypto.randomUUID();
        if (!messages.has(id)) messages.set(id, []);
        return id;
      },
      async appendUserMessage(conversationId, messageId, content) {
        messages.get(conversationId)?.push({ role: "user", messageId, content });
      },
      async appendAssistantMessage(
        conversationId,
        messageId,
        content,
        model,
        metadata,
      ) {
        messages
          .get(conversationId)
          ?.push({ role: "assistant", messageId, content, model, metadata });
      },
      async readSeededHistory(_workspaceId, conversationId) {
        if (!conversationId) return [];
        if (!messages.has(conversationId)) return [];

        return messages.get(conversationId)!.map((entry) => ({
          id: entry.messageId,
          role: entry.role,
          content: entry.content,
          metadata: entry.metadata,
        }));
      },
      async resetHistory({ conversationId }) {
        const deletedMessages = messages.get(conversationId)?.length ?? 0;
        messages.set(conversationId, []);
        return { deletedMessages };
      },
    };
  };

export const createMemoryUsageRepository = (): UsagePort => {
  const records: Array<{
    workspaceId: string;
    userId: string;
    conversationId: string;
    usage: TokenUsage;
    createdAt: number;
  }> = [];

  return {
    async record({ conversationId, usage }) {
      records.push({
        workspaceId: "demo-workspace",
        userId: "local-user",
        conversationId,
        usage,
        createdAt: Date.now(),
      });
    },
    async latest({ workspaceId, userId, conversationId }) {
      return records
        .filter(
          (record) =>
            record.workspaceId === workspaceId &&
            record.userId === userId &&
            record.conversationId === conversationId,
        )
        .sort((left, right) => right.createdAt - left.createdAt)[0]?.usage;
    },
    async reset({ workspaceId, userId, conversationId }) {
      let deletedUsageRecords = 0;
      for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index];
        if (
          record?.workspaceId === workspaceId &&
          record.userId === userId &&
          record.conversationId === conversationId
        ) {
          records.splice(index, 1);
          deletedUsageRecords += 1;
        }
      }
      return { deletedUsageRecords };
    },
  };
};

export const unconfiguredModelAdapter: ModelPort = {
  async *stream() {
    throw new Error(
      "AI model is not configured. Set OPENAI_API_KEY with SIDE_CHAT_MODEL_ADAPTER=openai, or set USE_FAKE_MODEL=true for tests.",
    );
  },
};
