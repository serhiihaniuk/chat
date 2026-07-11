import { describe, expect, it } from "vitest";

import type {
  ConversationQueryStore,
  StoredConversationMessage,
} from "#application/ports/conversation-query-store";
import { createCollectingTelemetrySink } from "#testing/collecting-telemetry-sink";

import { readConversationHistory, UNAVAILABLE_HISTORY_TEXT } from "./read-conversation-history.js";

const auth = { workspaceId: "workspace", subjectId: "subject", issuedAt: "2026-07-11T00:00:00Z" };

describe("readConversationHistory", () => {
  it("returns a valid persisted UI message unchanged", async () => {
    const stored = message([{ type: "text", text: "kept" }]);
    const telemetry = createCollectingTelemetrySink();

    const result = await readConversationHistory(
      { queries: queryStore([stored]), telemetry },
      auth,
      "conversation",
    );

    expect(result).toEqual([
      { id: "message-1", role: "assistant", parts: [{ type: "text", text: "kept" }], metadata: {} },
    ]);
    expect(telemetry.records).toEqual([]);
  });

  it("drops a removed tool part while preserving valid text", async () => {
    const stored = message([
      { type: "text", text: "safe history" },
      { type: "tool-removed", toolCallId: "call-1", state: "input-available", input: {} },
    ]);
    const telemetry = createCollectingTelemetrySink();

    const result = await readConversationHistory(
      { queries: queryStore([stored]), telemetry },
      auth,
      "conversation",
    );

    expect(result).toEqual([
      { id: "message-1", role: "assistant", parts: [{ type: "text", text: "safe history" }] },
    ]);
    expect(telemetry.records).toEqual([{ type: "persistence.history_drift" }]);
    expect(stored.parts).toHaveLength(2);
  });

  it("uses the neutral fallback when drift leaves no valid text", async () => {
    const stored = message([
      { type: "tool-removed", toolCallId: "call-1", state: "input-available", input: {} },
    ]);

    const result = await readConversationHistory(
      { queries: queryStore([stored]), telemetry: createCollectingTelemetrySink() },
      auth,
      "conversation",
    );

    expect(result[0]?.parts).toEqual([{ type: "text", text: UNAVAILABLE_HISTORY_TEXT }]);
  });
});

function message(parts: StoredConversationMessage["parts"]): StoredConversationMessage {
  return { id: "message-1", role: "assistant", parts, metadata: {} };
}

function queryStore(messages: readonly StoredConversationMessage[]): ConversationQueryStore {
  return {
    readHistory: () => Promise.resolve(messages),
    listConversations: () => Promise.resolve([]),
    findActiveTurn: () => Promise.resolve(undefined),
  };
}
