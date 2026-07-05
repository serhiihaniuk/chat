import { describe, expect, it } from "vitest";
import { HISTORY_CONTEXT_MODES, type PreparedHistoryMessage } from "#domain/capabilities-contract";
import { admitConversationHistoryContext } from "./admit-conversation-history-context.js";

describe("admitConversationHistoryContext", () => {
  it("admits ordered unique prior messages without leaking content into the manifest", () => {
    const admission = admitConversationHistoryContext({
      config: recentMessagesConfig(),
      currentUserMessageId: "message_current",
      messages: [
        historyMessage("message_assistant_001", 1, "assistant", "I will remember Blue Lynx."),
        historyMessage("message_user_001", 0, "user", "My project codename is Blue Lynx."),
        historyMessage("message_user_001", 0, "user", "duplicated content"),
        historyMessage("message_current", 2, "user", "find docs"),
      ],
    });

    expect(admission.admittedMessages.map((message) => message.messageId)).toEqual([
      "message_user_001",
      "message_assistant_001",
    ]);
    expect(admission.manifest).toMatchObject({
      policyMode: "recent_messages",
      consideredMessageCount: 2,
      admittedMessageCount: 2,
      droppedMessageCount: 0,
      estimatedTokens: 16,
      messages: [
        expect.objectContaining({ messageId: "message_user_001", included: true }),
        expect.objectContaining({ messageId: "message_assistant_001", included: true }),
      ],
    });
    expect(JSON.stringify(admission.manifest)).not.toContain("Blue Lynx");
  });

  it("drops the oldest messages beyond message and token limits", () => {
    const admission = admitConversationHistoryContext({
      config: recentMessagesConfig({ maxMessages: 3, maxTokens: 4 }),
      messages: [
        historyMessage("message_user_001", 0, "user", "too old", 2),
        historyMessage("message_assistant_001", 1, "assistant", "too many tokens", 10),
        historyMessage("message_user_002", 2, "user", "small", 2),
        historyMessage("message_assistant_002", 3, "assistant", "fits", 2),
      ],
    });

    expect(admission.admittedMessages.map((message) => message.messageId)).toEqual([
      "message_user_002",
      "message_assistant_002",
    ]);
    expect(admission.manifest.messages).toEqual([
      expect.objectContaining({
        messageId: "message_user_001",
        included: false,
        dropReason: "message_limit",
      }),
      expect.objectContaining({
        messageId: "message_assistant_001",
        included: false,
        dropReason: "token_limit",
      }),
      expect.objectContaining({ messageId: "message_user_002", included: true }),
      expect.objectContaining({ messageId: "message_assistant_002", included: true }),
    ]);
  });

  it("admits no messages when history is disabled", () => {
    const admission = admitConversationHistoryContext({
      config: {
        mode: HISTORY_CONTEXT_MODES.DISABLED,
        maxMessages: 6,
        maxTokens: 100,
      },
      messages: [historyMessage("message_user_001", 0, "user", "hidden")],
    });

    expect(admission).toEqual({
      admittedMessages: [],
      manifest: {
        policyMode: "disabled",
        consideredMessageCount: 0,
        admittedMessageCount: 0,
        droppedMessageCount: 0,
        estimatedTokens: 0,
        messages: [],
      },
    });
  });
});

const recentMessagesConfig = (
  overrides: Partial<{
    readonly maxMessages: number;
    readonly maxTokens: number;
  }> = {},
) => ({
  mode: HISTORY_CONTEXT_MODES.RECENT_MESSAGES,
  maxMessages: overrides.maxMessages ?? 6,
  maxTokens: overrides.maxTokens ?? 100,
});

const historyMessage = (
  messageId: string,
  sequenceIndex: number,
  role: PreparedHistoryMessage["role"],
  content: string,
  estimatedTokens = Math.max(1, Math.ceil(content.length / 4)),
): PreparedHistoryMessage => ({
  messageId,
  sequenceIndex,
  role,
  content,
  estimatedTokens,
});
