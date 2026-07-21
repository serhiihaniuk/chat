import { describe, expect, it, vi } from "vitest";

import type { WorkflowConversationClient, WorkflowUIMessage } from "../index.js";
import {
  createWorkflowChatTransport,
  type WorkflowClientToolDefinition,
} from "./workflow-chat-transport.js";

const USER_MESSAGE: WorkflowUIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
};

const CLIENT_TOOL: WorkflowClientToolDefinition = {
  name: "open_resource",
  description: "Open a host resource.",
  inputSchema: { type: "object" },
};

describe("workflow client-tool transport authority", () => {
  it("rejects client tools without originating-tab authority before delivery", async () => {
    const request = vi.fn<typeof fetch>();
    const client: WorkflowConversationClient = {
      baseUrl: "https://service.example",
      conversationId: "conversation-1",
      fetch: request,
      scopeKey: "test-scope",
    };
    const transport = createWorkflowChatTransport({
      getClient: () => client,
      getClientTools: () => [CLIENT_TOOL],
      onRunFinished: () => undefined,
      onRunStarted: () => undefined,
    });

    const stream = await transport.sendMessages({
      abortSignal: undefined,
      chatId: client.conversationId,
      messageId: undefined,
      messages: [USER_MESSAGE],
      trigger: "submit-message",
    });
    await expect(stream.pipeTo(new WritableStream())).rejects.toThrow(
      "Client tools require an originating-tab capability.",
    );
    expect(request).not.toHaveBeenCalled();
  });
});
