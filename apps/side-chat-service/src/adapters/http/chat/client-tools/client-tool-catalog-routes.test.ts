import type { UIMessage, UIMessageChunk } from "ai";
import { type JsonValue } from "@side-chat/shared";
import { describe, expect, it } from "vitest";

import { HTTP_ERROR } from "#adapters/http/error-response";
import { CHAT_HTTP_ROUTES, HTTP_HEADERS } from "#adapters/http/http-contract";
import { SERVER_TOOL_APPROVAL_POLICIES, defineServerTool } from "@side-chat/side-chat-server";
import type {
  StartedTurnExecution,
  TurnExecution,
  TurnExecutionInput,
  TurnExecutionTerminal,
} from "#application/ports/turn/turn-execution";
import { createServiceTestHarness } from "#composition/route/testing-harness/service-test-harness";
import { SCRIPTED_PROVIDER } from "#config/providers/scripted-provider-config";
import { DeterministicTurnAdmission } from "#testing/turn/deterministic-turn-admission";

const SUCCESS_HTTP_STATUS = 200;
const TEST_RUN_ID = "run-1";

const REQUEST_USER_MESSAGE: UIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Hello" }],
};

describe("chat route client-tool catalog", () => {
  it("rejects client tools without originating-tab authority before execution", async () => {
    const execution = new CatalogCapturingTurnExecution();
    const harness = await createServiceTestHarness({ turnExecution: execution });
    try {
      const response = await harness.request(
        CHAT_HTTP_ROUTES.START,
        chatRequest(
          [
            {
              name: "open_file",
              description: "Open a file.",
              inputSchema: { type: "object" },
            },
          ],
          false,
        ),
      );

      expect(response.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
      expect(execution.started).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("validates the catalog before admission, writes, or execution", async () => {
    const admission = new DeterministicTurnAdmission();
    const execution = new CatalogCapturingTurnExecution();
    const harness = await createServiceTestHarness({
      turnAdmission: admission,
      turnExecution: execution,
    });
    try {
      const invalidCatalog = [
        {
          name: "open_file",
          description: "Open a file.",
          inputSchema: { type: "object" },
        },
        {
          name: "open_file",
          description: "Shadow the first declaration.",
          inputSchema: { type: "object" },
        },
      ];
      const response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest(invalidCatalog));

      expect(response.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
      expect(admission.admitted).toBe(0);
      expect(harness.turnState.userMessages).toEqual([]);
      expect(execution.started).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("rejects a client catalog colliding with a registered server tool before execution", async () => {
    const admission = new DeterministicTurnAdmission();
    const execution = new CatalogCapturingTurnExecution();
    const harness = await createServiceTestHarness({
      serverTools: [collisionServerTool()],
      turnAdmission: admission,
      turnExecution: execution,
    });
    try {
      const response = await harness.request(
        CHAT_HTTP_ROUTES.START,
        chatRequest([
          {
            name: "mock_web_search",
            description: "Shadow the server tool.",
            inputSchema: { type: "object" },
          },
        ]),
      );

      expect(response.status).toBe(HTTP_ERROR.BAD_REQUEST.STATUS);
      expect(admission.admitted).toBe(0);
      expect(harness.turnState.userMessages).toEqual([]);
      expect(execution.started).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("passes a validated catalog to turn execution", async () => {
    const execution = new CatalogCapturingTurnExecution();
    const harness = await createServiceTestHarness({
      turnExecution: execution,
    });
    const clientTools = [
      {
        name: "open_file",
        description: "Open a file.",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ];
    let response: Response | undefined;
    try {
      response = await harness.request(CHAT_HTTP_ROUTES.START, chatRequest(clientTools));

      expect(response.status).toBe(SUCCESS_HTTP_STATUS);
      expect(execution.started[0]?.clientTools).toEqual(clientTools);
      expect(execution.started[0]?.clientToolCapabilityDigest).toMatch(/^[0-9a-f]{64}$/u);
      expect(execution.started[0]?.clientToolCapabilityDigest).not.toBe("a".repeat(64));
    } finally {
      await response?.body?.cancel();
      await harness.close();
    }
  });
});

class CatalogCapturingTurnExecution implements TurnExecution {
  readonly started: TurnExecutionInput[] = [];

  async start(input: TurnExecutionInput): Promise<StartedTurnExecution> {
    this.started.push(input);
    return {
      runId: TEST_RUN_ID,
      stream: new ReadableStream<UIMessageChunk>(),
      terminal: new Promise<TurnExecutionTerminal>(() => undefined),
    };
  }

  async resume(runId: string, input: TurnExecutionInput): Promise<StartedTurnExecution> {
    const execution = await this.start(input);
    return { ...execution, runId };
  }

  async cancel(): Promise<void> {}
}

function collisionServerTool() {
  return defineServerTool<JsonValue, { readonly ok: true }>({
    name: "mock_web_search",
    description: "Search the web.",
    inputSchema: { type: "object" },
    validateInput: (input): input is JsonValue => input !== undefined,
    approvalPolicy: { kind: SERVER_TOOL_APPROVAL_POLICIES.UNGATED },
    execute: async () => ({ ok: true }),
  });
}

function chatRequest(clientTools: readonly unknown[], includeCapability = true): RequestInit {
  return {
    method: "POST",
    ...(includeCapability
      ? { headers: { [HTTP_HEADERS.CLIENT_TOOL_CAPABILITY]: "a".repeat(64) } }
      : {}),
    body: JSON.stringify({
      requestId: "request-1",
      conversationId: "conversation-1",
      messages: [REQUEST_USER_MESSAGE],
      modelPreference: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
      clientTools,
    }),
  };
}
