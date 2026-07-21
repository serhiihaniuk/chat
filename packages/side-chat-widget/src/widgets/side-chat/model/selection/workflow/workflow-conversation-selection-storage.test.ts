import { describe, expect, it } from "vitest";

import {
  readWorkflowConversationSelection,
  writeWorkflowConversationSelection,
} from "./workflow-conversation-selection-storage.js";

describe("workflow conversation selection scope", () => {
  it("restores only the authenticated scope that wrote the selection", () => {
    const store = createStorage();
    const storageKey = "shared-widget:conversation-selection";
    writeWorkflowConversationSelection(storageKey, "scope-a", "conversation-collision", store);

    expect(readWorkflowConversationSelection(storageKey, "scope-a", store)).toBe(
      "conversation-collision",
    );
    expect(readWorkflowConversationSelection(storageKey, "scope-b", store)).toBeUndefined();
    expect(store.getItem(storageKey)).toBeNull();
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
