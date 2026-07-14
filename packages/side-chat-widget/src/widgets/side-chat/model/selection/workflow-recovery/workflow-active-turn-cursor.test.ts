import { describe, expect, it } from "vitest";

import {
  clearWorkflowActiveTurnCursor,
  readWorkflowActiveTurnCursor,
  writeWorkflowActiveTurnCursor,
} from "./workflow-active-turn-cursor.js";

describe("tab-scoped workflow active-turn cursor", () => {
  it("round-trips only active run identity under the explicit key", () => {
    const store = createStorage();
    writeWorkflowActiveTurnCursor(
      "workspace-a:widget-a:active-turn",
      { conversationId: "conversation-1", runId: "run-1" },
      store,
    );

    expect(readWorkflowActiveTurnCursor("workspace-a:widget-a:active-turn", store)).toEqual({
      conversationId: "conversation-1",
      runId: "run-1",
    });
    expect(store.getItem("workspace-b:widget-a:active-turn")).toBeNull();
  });

  it("clears only the matching terminal run and preserves a newer accepted run", () => {
    const store = createStorage();
    const key = "workspace-a:widget-a:active-turn";
    writeWorkflowActiveTurnCursor(
      key,
      { conversationId: "conversation-2", runId: "run-new" },
      store,
    );

    clearWorkflowActiveTurnCursor(key, "run-old", store);
    expect(readWorkflowActiveTurnCursor(key, store)?.runId).toBe("run-new");

    clearWorkflowActiveTurnCursor(key, "run-new", store);
    expect(readWorkflowActiveTurnCursor(key, store)).toBeUndefined();
  });

  it("removes malformed state instead of treating it as a conversation selection", () => {
    const store = createStorage();
    const key = "workspace-a:widget-a:active-turn";
    store.setItem(key, JSON.stringify({ conversationId: "conversation-1" }));

    expect(readWorkflowActiveTurnCursor(key, store)).toBeUndefined();
    expect(store.getItem(key)).toBeNull();
  });

  it("does nothing when the host did not provide an isolation key", () => {
    const store = createStorage();
    writeWorkflowActiveTurnCursor(
      undefined,
      { conversationId: "conversation-1", runId: "run-1" },
      store,
    );

    expect(store.length).toBe(0);
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
