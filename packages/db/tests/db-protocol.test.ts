import { expect, test } from "vitest";

import { SideChatDb } from "../src";
import type { ModelSelection, TokenUsage } from "@side-chat/shared-protocol";

test("createOrGetConversation uses stored procedure", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows: [] };
    },
  };

  const db = new SideChatDb(fake);
  await db.createOrGetConversation("demo-workspace", "demo-user", "conv-1");

  expect(calls[0].text).toContain("sidechat_create_or_get_conversation");
  expect(calls[0].params).toEqual(["demo-workspace", "demo-user", "conv-1"]);
});

test("appendUserMessage uses stored procedure", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows: [] };
    },
  };

  const db = new SideChatDb(fake);
  await db.appendUserMessage("conv-1", "msg-1", "hello");

  expect(calls[0].text).toContain("sidechat_append_user_message");
  expect(calls[0].params).toEqual(["conv-1", "msg-1", "hello"]);
});

test("appendAssistantMessage uses stored procedure", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows: [] };
    },
  };

  const db = new SideChatDb(fake);
  const model: ModelSelection = { provider: "openai", id: "gpt-4.1-mini" };
  await db.appendAssistantMessage("conv-1", "msg-2", "reply", model, {
    citations: [{ sourceId: "source-1" }],
  });

  expect(calls[0].text).toContain("sidechat_append_assistant_message");
  expect(calls[0].params).toEqual([
    "conv-1",
    "msg-2",
    "reply",
    "openai",
    "gpt-4.1-mini",
    { citations: [{ sourceId: "source-1" }] },
  ]);
});

test("readSeededHistory uses stored procedure", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows: [] };
    },
  };

  const db = new SideChatDb(fake);
  await db.readSeededHistory("demo-workspace", "conv-1");

  expect(calls[0].text).toContain("sidechat_read_seeded_history");
});

test("resetConversationHistory uses stored procedure", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows: [] };
    },
  };

  const db = new SideChatDb(fake);
  await db.resetConversationHistory("demo-workspace", "demo-user", "conv-1");

  expect(calls[0].text).toContain("sidechat_reset_conversation_history");
  expect(calls[0].params).toEqual(["demo-workspace", "demo-user", "conv-1"]);
});

test("recordUsage uses stored procedure", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows: [] };
    },
  };

  const db = new SideChatDb(fake);
  const model: ModelSelection = { provider: "openai", id: "gpt-4.1-mini" };
  const usage: TokenUsage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
  await db.recordUsage("req-1", "conv-1", "msg-2", model, usage);

  expect(calls[0].text).toContain("sidechat_record_usage");
  expect(calls[0].params).toEqual([
    "req-1",
    "conv-1",
    "msg-2",
    "openai",
    "gpt-4.1-mini",
    1,
    2,
    3,
    null,
    null,
    null,
    null,
  ]);
});

test("getLatestUsage uses stored procedure", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return {
        rows: [
          {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            reasoningTokens: 4,
            cachedInputTokens: 2,
            estimatedCostUsd: 0.000005,
          },
        ],
      };
    },
  };

  const db = new SideChatDb(fake);
  const result = await db.getLatestUsage(
    "demo-workspace",
    "demo-user",
    "conv-1",
  );

  expect(calls[0].text).toContain("sidechat_get_latest_usage");
  expect(calls[0].params).toEqual(["demo-workspace", "demo-user", "conv-1"]);
  expect(result.rows[0]).toMatchObject({
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    reasoningTokens: 4,
    cachedInputTokens: 2,
    estimatedCostUsd: 0.000005,
  });
});

test("resetConversationUsage uses stored procedure", async () => {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const fake = {
    query: async (text: string, params: unknown[]) => {
      calls.push({ text, params });
      return { rows: [] };
    },
  };

  const db = new SideChatDb(fake);
  await db.resetConversationUsage("demo-workspace", "demo-user", "conv-1");

  expect(calls[0].text).toContain("sidechat_reset_conversation_usage");
  expect(calls[0].params).toEqual(["demo-workspace", "demo-user", "conv-1"]);
});
