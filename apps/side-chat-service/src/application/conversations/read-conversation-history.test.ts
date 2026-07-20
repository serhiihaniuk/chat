import { describe, expect, it } from "vitest";
import { z } from "zod";

import type {
  ConversationHistoryQuery,
  ConversationQueryStore,
  StoredConversationMessage,
} from "#application/ports/conversation-query-store";
import { createCollectingTelemetrySink } from "#testing/collecting-telemetry-sink";
import { defineServerTool, SERVER_TOOL_APPROVAL_POLICIES } from "@side-chat/side-chat-server";

import {
  readConversationHistory,
  structuredPartCatalogsForServerTools,
  UNAVAILABLE_HISTORY_TEXT,
  type StructuredPartCatalogs,
} from "./read-conversation-history.js";

const auth = {
  workspaceId: "workspace",
  subjectId: "subject",
  issuedAt: "2026-07-11T00:00:00Z",
};

const weatherCatalog: StructuredPartCatalogs = {
  tools: {
    // `execute` is unused on the read path (validation reads only the schemas),
    // but the SDK `Tool` type requires it for a non-dynamic tool.
    weather: {
      inputSchema: z.object({ city: z.string() }),
      execute: () => Promise.resolve("ok"),
    },
  },
  dataSchemas: {},
};

describe("readConversationHistory", () => {
  it("returns a valid persisted UI message unchanged", async () => {
    const stored = message([{ type: "text", text: "kept" }]);
    const telemetry = createCollectingTelemetrySink();

    const result = await readConversationHistory(
      { queries: queryStore([stored]), telemetry },
      auth,
      "conversation",
    );

    expect(result.messages).toEqual([
      {
        id: "message-1",
        role: "assistant",
        parts: [{ type: "text", text: "kept" }],
      },
    ]);
    expect(result.hasMore).toBe(false);
    expect(telemetry.records).toEqual([]);
  });

  it("preserves valid folded usage and activity-duration metadata", async () => {
    const stored = message([{ type: "text", text: "kept" }], {
      activityDurationMs: 1_501,
      usage: {
        inputTokens: 3,
        outputTokens: 5,
        totalTokens: 8,
        reasoningTokens: 1,
        cachedInputTokens: 2,
      },
    });
    const telemetry = createCollectingTelemetrySink();

    const result = await readConversationHistory(
      { queries: queryStore([stored]), telemetry },
      auth,
      "conversation",
    );

    expect(result.messages).toEqual([
      {
        id: "message-1",
        role: "assistant",
        parts: [{ type: "text", text: "kept" }],
        metadata: {
          activityDurationMs: 1_501,
          usage: {
            inputTokens: 3,
            outputTokens: 5,
            totalTokens: 8,
            reasoningTokens: 1,
            cachedInputTokens: 2,
          },
        },
      },
    ]);
    expect(telemetry.records).toEqual([]);
  });

  it("projects private metadata to text and records history drift", async () => {
    const stored = message([{ type: "text", text: "safe" }], {
      provider: { secret: "must-not-leak" },
    });
    const telemetry = createCollectingTelemetrySink();

    const result = await readConversationHistory(
      { queries: queryStore([stored]), telemetry },
      auth,
      "conversation",
    );

    expect(result.messages).toEqual([
      {
        id: "message-1",
        role: "assistant",
        parts: [{ type: "text", text: "safe" }],
      },
    ]);
    expect(telemetry.records).toEqual([{ type: "persistence.history_drift" }]);
  });

  it("keeps a tool part when its schema is present in the catalog", async () => {
    const toolPart = {
      type: "tool-weather",
      toolCallId: "call-1",
      state: "input-available",
      input: { city: "Paris" },
    };
    const telemetry = createCollectingTelemetrySink();

    const result = await readConversationHistory(
      {
        queries: queryStore([message([{ type: "text", text: "before" }, toolPart])]),
        telemetry,
        structuredPartCatalogs: weatherCatalog,
      },
      auth,
      "conversation",
    );

    expect(result.messages[0]?.parts).toContainEqual(toolPart);
    expect(telemetry.records).toEqual([]);
  });

  it("keeps registered server-tool history through the production catalog adapter", async () => {
    const toolPart = {
      type: "tool-mock_web_search",
      toolCallId: "call-1",
      state: "output-available",
      input: { query: "latest news" },
      output: { results: [] },
      approval: { id: "approval-call-1" },
    };
    const definition = defineServerTool<{ query: string }, { results: readonly [] }>({
      name: "mock_web_search",
      description: "Search",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
      approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.ALWAYS },
      validateInput: (input): input is { query: string } =>
        typeof input === "object" &&
        input !== null &&
        "query" in input &&
        typeof input["query"] === "string",
      execute: () => Promise.resolve({ results: [] }),
    });
    const telemetry = createCollectingTelemetrySink();

    const result = await readConversationHistory(
      {
        queries: queryStore([message([toolPart])]),
        telemetry,
        structuredPartCatalogs: structuredPartCatalogsForServerTools([definition]),
      },
      auth,
      "conversation",
    );

    expect(result.messages[0]?.parts).toContainEqual({
      type: "tool-mock_web_search",
      toolCallId: "call-1",
      state: "output-available",
      input: { query: "latest news" },
      output: { results: [] },
    });
    expect(result.messages[0]?.parts).not.toContainEqual(
      expect.objectContaining({ approval: expect.anything() }),
    );
    expect(telemetry.records).toEqual([]);
  });

  it("degrades a tool part whose schema was removed from the catalog", async () => {
    const stored = message([
      { type: "text", text: "safe" },
      {
        type: "tool-legacy",
        toolCallId: "call-1",
        state: "input-available",
        input: {},
      },
    ]);
    const telemetry = createCollectingTelemetrySink();

    const result = await readConversationHistory(
      {
        queries: queryStore([stored]),
        telemetry,
        structuredPartCatalogs: weatherCatalog,
      },
      auth,
      "conversation",
    );

    expect(result.messages).toEqual([
      {
        id: "message-1",
        role: "assistant",
        parts: [{ type: "text", text: "safe" }],
      },
    ]);
    expect(telemetry.records).toEqual([{ type: "persistence.history_drift" }]);
  });

  it("drops a removed tool part while preserving valid text", async () => {
    const stored = message([
      { type: "text", text: "safe history" },
      {
        type: "tool-removed",
        toolCallId: "call-1",
        state: "input-available",
        input: {},
      },
    ]);
    const telemetry = createCollectingTelemetrySink();

    const result = await readConversationHistory(
      { queries: queryStore([stored]), telemetry },
      auth,
      "conversation",
    );

    expect(result.messages).toEqual([
      {
        id: "message-1",
        role: "assistant",
        parts: [{ type: "text", text: "safe history" }],
      },
    ]);
    expect(telemetry.records).toEqual([{ type: "persistence.history_drift" }]);
    expect(stored.parts).toHaveLength(2);
  });

  it("uses the neutral fallback when drift leaves no valid text", async () => {
    const stored = message([
      {
        type: "tool-removed",
        toolCallId: "call-1",
        state: "input-available",
        input: {},
      },
    ]);

    const result = await readConversationHistory(
      {
        queries: queryStore([stored]),
        telemetry: createCollectingTelemetrySink(),
      },
      auth,
      "conversation",
    );

    expect(result.messages[0]?.parts).toEqual([{ type: "text", text: UNAVAILABLE_HISTORY_TEXT }]);
  });

  it("forwards the paging query and surfaces the backward cursor", async () => {
    let receivedQuery: ConversationHistoryQuery | undefined;
    const store: ConversationQueryStore = {
      readHistory: (_auth, _conversationId, query) => {
        receivedQuery = query;
        return Promise.resolve({
          messages: [
            {
              id: "m",
              role: "assistant",
              parts: [{ type: "text", text: "x" }],
              metadata: {},
            },
          ],
          hasMoreBefore: true,
          nextBeforeSequenceIndex: 7,
        });
      },
      listConversations: () => Promise.resolve([]),
      listActiveTurns: () => Promise.resolve([]),
      readState: () => Promise.resolve({ history: { messages: [], hasMoreBefore: false } }),
    };

    const result = await readConversationHistory(
      { queries: store, telemetry: createCollectingTelemetrySink() },
      auth,
      "conversation",
      { limit: 5, beforeSequenceIndex: 9 },
    );

    expect(receivedQuery).toEqual({ limit: 5, beforeSequenceIndex: 9 });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(7);
  });
});

function message(
  parts: StoredConversationMessage["parts"],
  metadata: StoredConversationMessage["metadata"] = {},
): StoredConversationMessage {
  return { id: "message-1", role: "assistant", parts, metadata };
}

function queryStore(messages: readonly StoredConversationMessage[]): ConversationQueryStore {
  return {
    readHistory: () => Promise.resolve({ messages, hasMoreBefore: false }),
    listConversations: () => Promise.resolve([]),
    listActiveTurns: () => Promise.resolve([]),
    readState: () => Promise.resolve({ history: { messages, hasMoreBefore: false } }),
  };
}
