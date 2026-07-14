import { describe, expect, it } from "vitest";

import { resolveSideChatPanelGuards } from "./side-chat-panel-view.js";

describe("resolveSideChatPanelGuards", () => {
  it("keeps idle navigation available", () => {
    expect(resolveSideChatPanelGuards(false, false)).toEqual({
      conversationSelectionDisabled: false,
      newConversationDisabled: false,
    });
  });

  it("protects a busy draft from every selection change", () => {
    expect(resolveSideChatPanelGuards(true, false)).toEqual({
      conversationSelectionDisabled: true,
      newConversationDisabled: true,
    });
  });

  it("keeps New chat available for a cataloged busy conversation", () => {
    expect(resolveSideChatPanelGuards(true, true)).toEqual({
      conversationSelectionDisabled: true,
      newConversationDisabled: false,
    });
  });
});
