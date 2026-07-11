import { describe, expect, it, vi } from "vitest";

import { validateSettings } from "#config/settings/resolve-settings";
import { createDefaultConfig } from "#config/settings/settings.test-fixture";
import { TURN_MESSAGE_ROLES } from "#domain/turn/turn";
import { CHAT_TURN_OUTCOMES, type ChatTurnWorkflowInput } from "#workflows/production/chat-turn";

import { createWorkflowTurnExecution, type StartChatTurn } from "./workflow-turn-execution.js";

describe("createWorkflowTurnExecution", () => {
  it("passes timeout and client-tool metadata into the workflow boundary", async () => {
    const result = validateSettings(createDefaultConfig());
    if (!result.ok) throw new Error("Test settings must be valid");
    const settings = result.settings;
    const startTurn = vi.fn<StartChatTurn>((_input: ChatTurnWorkflowInput) =>
      Promise.resolve({
        runId: "run-1",
        stream: new ReadableStream(),
        terminal: Promise.resolve({
          status: CHAT_TURN_OUTCOMES.COMPLETED,
          text: "",
          finishReason: "stop",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        }),
      }),
    );
    const execution = createWorkflowTurnExecution(settings, startTurn);
    const clientTools = [{ name: "open_file" }];

    await execution.start({
      conversationId: "conversation-1",
      turnId: "turn-1",
      requestId: "request-1",
      modelId: "test-model",
      messages: [{ id: "user-1", role: TURN_MESSAGE_ROLES.USER, text: "Hello" }],
      clientTools,
    });

    expect(startTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTimeoutMs: settings.timeouts.providerMs,
        clientTools,
      }),
    );
  });
});
