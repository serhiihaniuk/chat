import { describe, expect, it, vi } from "vitest";
import { createSideChatPersistence } from "../src/index.js";

describe("sidechat persistence adapter", () => {
  it("adapts stored procedures to conversation and usage ports", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const persistence = createSideChatPersistence({
      async query(text, params) {
        calls.push({ text, params });
        if (text.includes("sidechat_create_or_get_conversation"))
          return { rows: [{ conversation_id: "conv-db-1" }] };
        return { rows: [] };
      },
    });

    await expect(
      persistence.conversations.createOrGet({
        workspaceId: "demo-workspace",
        userId: "demo-user",
        conversationId: "demo-conversation-001",
      }),
    ).resolves.toBe("conv-db-1");
    await persistence.conversations.appendUserMessage(
      "conv-db-1",
      "client-msg-001",
      "hello",
    );
    await persistence.conversations.appendAssistantMessage(
      "conv-db-1",
      "assistant-msg-001",
      "hi",
      { provider: "openai", id: "gpt-4.1-mini" },
    );
    await persistence.usage.record({
      requestId: "req-001",
      conversationId: "conv-db-1",
      messageId: "assistant-msg-001",
      model: { provider: "openai", id: "gpt-4.1-mini" },
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    });

    expect(calls.map((call) => call.text)).toEqual([
      "select * from sidechat_create_or_get_conversation($1, $2, $3)",
      "select * from sidechat_append_user_message($1, $2, $3)",
      "select * from sidechat_append_assistant_message($1, $2, $3, $4, $5)",
      "select * from sidechat_record_usage($1, $2, $3, $4, $5, $6, $7, $8)",
    ]);
  });

  it("uses the provided close hook for runtime pool cleanup", async () => {
    const close = vi.fn(async () => {});
    const persistence = createSideChatPersistence(
      { query: async () => ({ rows: [] }) },
      close,
    );
    await persistence.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
