import { describe, expect, it } from "vitest";

import {
  clearWorkflowActiveTurnCursor,
  readWorkflowActiveTurnCursor,
  writeWorkflowActiveTurnCursor,
} from "./workflow-active-turn-cursor.js";

describe("tab-scoped workflow active-turn cursor", () => {
  const scopeKey = "workspace-a:subject-a";

  it("round-trips active run identity and originating-tab authority under the explicit key", () => {
    const store = createStorage();
    writeWorkflowActiveTurnCursor(
      "workspace-a:widget-a:active-turn",
      {
        clientToolCapability: "a".repeat(64),
        conversationId: "conversation-1",
        runId: "run-1",
        scopeKey,
      },
      store,
    );

    expect(
      readWorkflowActiveTurnCursor("workspace-a:widget-a:active-turn", scopeKey, store),
    ).toEqual({
      clientToolCapability: "a".repeat(64),
      conversationId: "conversation-1",
      runId: "run-1",
      scopeKey,
    });
    expect(store.getItem("workspace-b:widget-a:active-turn")).toBeNull();
  });

  it("clears only the matching terminal run and preserves a newer accepted run", () => {
    const store = createStorage();
    const key = "workspace-a:widget-a:active-turn";
    writeWorkflowActiveTurnCursor(
      key,
      { conversationId: "conversation-2", runId: "run-new", scopeKey },
      store,
    );

    clearWorkflowActiveTurnCursor(key, scopeKey, "run-old", store);
    expect(readWorkflowActiveTurnCursor(key, scopeKey, store)?.runId).toBe("run-new");

    clearWorkflowActiveTurnCursor(key, scopeKey, "run-new", store);
    expect(readWorkflowActiveTurnCursor(key, scopeKey, store)).toBeUndefined();
  });

  it("removes malformed state instead of treating it as a conversation selection", () => {
    const store = createStorage();
    const key = "workspace-a:widget-a:active-turn";
    store.setItem(key, JSON.stringify({ conversationId: "conversation-1" }));

    expect(readWorkflowActiveTurnCursor(key, scopeKey, store)).toBeUndefined();
    expect(store.getItem(key)).toBeNull();
  });

  it("removes malformed originating-tab authority", () => {
    const store = createStorage();
    const key = "workspace-a:widget-a:active-turn";
    store.setItem(
      key,
      JSON.stringify({
        clientToolCapability: "predictable",
        conversationId: "conversation-1",
        runId: "run-1",
        scopeKey,
      }),
    );

    expect(readWorkflowActiveTurnCursor(key, scopeKey, store)).toBeUndefined();
    expect(store.getItem(key)).toBeNull();
  });

  it("does nothing when the host did not provide an isolation key", () => {
    const store = createStorage();
    writeWorkflowActiveTurnCursor(
      undefined,
      { conversationId: "conversation-1", runId: "run-1", scopeKey },
      store,
    );

    expect(store.length).toBe(0);
  });

  it("rejects and removes a cursor from another authenticated scope", () => {
    const store = createStorage();
    const key = "shared-widget:active-turn";
    writeWorkflowActiveTurnCursor(
      key,
      { conversationId: "conversation-1", runId: "run-1", scopeKey },
      store,
    );

    expect(readWorkflowActiveTurnCursor(key, "workspace-b:subject-b", store)).toBeUndefined();
    expect(store.getItem(key)).toBeNull();
  });
});

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
