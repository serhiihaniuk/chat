import { describe, expect, it } from "vitest";

import { resolveSideChatPanelGuards } from "./side-chat-panel-view.js";

describe("resolveSideChatPanelGuards", () => {
  it("keeps idle navigation available", () => {
    expect(resolveSideChatPanelGuards()).toEqual({
      conversationSelectionDisabled: false,
      newConversationDisabled: false,
    });
  });

  it("keeps a busy draft navigable while its session continues in the background", () => {
    expect(resolveSideChatPanelGuards()).toEqual({
      conversationSelectionDisabled: false,
      newConversationDisabled: false,
    });
  });

  it("keeps conversation switching available for a cataloged busy conversation", () => {
    expect(resolveSideChatPanelGuards()).toEqual({
      conversationSelectionDisabled: false,
      newConversationDisabled: false,
    });
  });
});
