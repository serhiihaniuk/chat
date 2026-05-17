import { describe, expect, it } from "vitest";
import { SideChatDb } from "../src/index.js";

describe("stored procedure db boundary", () => {
  it("uses only sidechat stored procedures/functions at runtime", async () => {
    const sql: string[] = [];
    const db = new SideChatDb({
      query: async (text: string) => {
        sql.push(text);
        return { rows: [], rowCount: 0 } as never;
      },
    });
    await db.createOrGetConversation(
      "demo-workspace",
      "demo-user",
      "demo-conversation-001",
    );
    await db.appendUserMessage(
      "demo-conversation-001",
      "client-msg-001",
      "hello",
    );
    await db.appendAssistantMessage(
      "demo-conversation-001",
      "assistant-msg-001",
      "hi",
      { provider: "openai", id: "gpt-4.1-mini" },
    );
    await db.readSeededHistory("demo-workspace", "demo-conversation-001");
    await db.resetConversationHistory(
      "demo-workspace",
      "demo-user",
      "demo-conversation-001",
    );
    await db.recordUsage(
      "req-001",
      "demo-conversation-001",
      "assistant-msg-001",
      { provider: "openai", id: "gpt-4.1-mini" },
      { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    );
    await db.resetConversationUsage(
      "demo-workspace",
      "demo-user",
      "demo-conversation-001",
    );
    expect(sql.every((query) => /^select \* from sidechat_/.test(query))).toBe(
      true,
    );
    expect(sql.join("\n")).not.toMatch(/\b(insert|update|delete)\b/i);
  });
});
