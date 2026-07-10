import { describe, expect, it, vi } from "vitest";

import { createRunShellBridge } from "./run-shell-bridge.js";

describe("RunShellBridge", () => {
  it("publishes immutable snapshots as the run crosses shell lifecycle boundaries", () => {
    const bridge = createRunShellBridge();
    const listener = vi.fn<() => void>();
    const unsubscribe = bridge.subscribe(listener);

    bridge.markTurnSubmitted("First prompt");
    bridge.adoptConversation("conversation-1");

    expect(bridge.getSnapshot()).toEqual({
      pendingConversationTitle: "First prompt",
      streamOwnedConversationId: "conversation-1",
    });
    expect(Object.isFrozen(bridge.getSnapshot())).toBe(true);

    bridge.releaseStreamOwnership();
    expect(bridge.getSnapshot()).toEqual({
      pendingConversationTitle: "First prompt",
      streamOwnedConversationId: undefined,
    });

    bridge.resetForConversationSelection();
    expect(bridge.getSnapshot()).toEqual({
      pendingConversationTitle: undefined,
      streamOwnedConversationId: undefined,
    });
    expect(listener).toHaveBeenCalledTimes(4);

    unsubscribe();
    bridge.markTurnSubmitted("Second prompt");
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
