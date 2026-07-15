import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkflowConversationCatalog, WorkflowUIMessage } from "#entities/workflow-chat";

import {
  isWorkflowConversationTitleFallback,
  refreshWorkflowConversationTitle,
  TITLE_REFRESH_MAX_RETRIES,
} from "./workflow-conversation-title-refresh.js";

describe("workflow conversation title refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for a generated title to replace the observed fallback", async () => {
    const readCatalog = queuedCatalogReader([
      catalog("First user message"),
      catalog("Recovered conversation title"),
    ]);

    const result = refreshWorkflowConversationTitle({
      conversationId: "conversation-1",
      initialTitle: "First user message",
      readCatalog,
    });
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(result).resolves.toBe(true);
    expect(readCatalog).toHaveBeenCalledTimes(2);
  });

  it("keeps polling when a new conversation has no initial catalog row", async () => {
    const readCatalog = queuedCatalogReader([
      emptyCatalog(),
      catalog("First user message"),
      catalog("Generated title"),
    ]);

    const result = refreshWorkflowConversationTitle({
      conversationId: "conversation-1",
      readCatalog,
    });
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(result).resolves.toBe(true);
    expect(readCatalog).toHaveBeenCalledTimes(3);
  });

  it("stops after the bounded retry window when no title arrives", async () => {
    const readCatalog = queuedCatalogReader([catalog("First user message")]);

    const result = refreshWorkflowConversationTitle({
      conversationId: "conversation-1",
      initialTitle: "First user message",
      readCatalog,
    });
    await vi.advanceTimersByTimeAsync(TITLE_REFRESH_MAX_RETRIES * 1_500);

    await expect(result).resolves.toBe(false);
    expect(readCatalog).toHaveBeenCalledTimes(TITLE_REFRESH_MAX_RETRIES + 1);
  });

  it("recognizes the first user message as the untitled catalog fallback", () => {
    const messages: readonly WorkflowUIMessage[] = [
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "  First   user message " }],
      },
    ];

    expect(
      isWorkflowConversationTitleFallback(
        catalog("First user message"),
        "conversation-1",
        messages,
      ),
    ).toBe(true);
    expect(
      isWorkflowConversationTitleFallback(catalog("Generated title"), "conversation-1", messages),
    ).toBe(false);
  });
});

function queuedCatalogReader(catalogs: readonly WorkflowConversationCatalog[]) {
  let index = 0;
  return vi.fn<() => Promise<WorkflowConversationCatalog>>(() => {
    const value = catalogs[Math.min(index, catalogs.length - 1)] ?? emptyCatalog();
    index += 1;
    return Promise.resolve(value);
  });
}

function catalog(title: string): WorkflowConversationCatalog {
  return {
    conversations: [{ id: "conversation-1", title }],
    runningConversationIds: new Set(),
  };
}

function emptyCatalog(): WorkflowConversationCatalog {
  return { conversations: [], runningConversationIds: new Set() };
}
