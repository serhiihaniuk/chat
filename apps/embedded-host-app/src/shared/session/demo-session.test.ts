import { describe, expect, it, vi } from "vitest";

import { resolveDemoConversationId } from "./demo-session.js";

const createStorage = (initial?: string) => {
  const values = new Map<string, string>();
  if (initial) values.set("sidechat.demoConversationId", initial);

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
};

describe("demo chat sessions", () => {
  it("reuses the browser-local demo conversation id", () => {
    const storage = createStorage("demo-conversation-existing");

    expect(resolveDemoConversationId(storage)).toBe("demo-conversation-existing");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("creates and stores a new conversation id for a first-time viewer", () => {
    const storage = createStorage();

    const conversationId = resolveDemoConversationId(storage);

    expect(conversationId).toMatch(/^demo-conversation-/);
    expect(storage.setItem).toHaveBeenCalledWith(
      "sidechat.demoConversationId",
      conversationId,
    );
  });

  it("still creates an isolated id when browser storage is unavailable", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage blocked");
      }),
      setItem: vi.fn(),
    };

    expect(resolveDemoConversationId(storage)).toMatch(/^demo-conversation-/);
  });
});

