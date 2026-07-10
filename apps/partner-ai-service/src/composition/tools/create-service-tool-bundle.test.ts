import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { RUNTIME_EVENT_TYPES, type RuntimeEvent } from "@side-chat/ai-runtime-contract";
import type { AgentRuntime, RuntimeToolContext } from "@side-chat/agent-runtime";
import {
  MOCK_WEB_SEARCH_TOOL_NAME,
  createMockWebSearchRegistration,
} from "#adapters/tools/mock-web-search-tool";
import {
  createServiceToolRegistration,
  ServiceToolRegistryError,
} from "#composition/tools/service-tool-registry";
import { createServiceToolBundle } from "./create-service-tool-bundle.js";

const workspace = { tenantId: "tenant_tool", workspaceId: "workspace_tool" } as const;

describe("createServiceToolBundle", () => {
  it("builds an empty tool surface when no tools are configured", () => {
    const bundle = createServiceToolBundle({ workspace });

    expect(bundle.toolCapabilities).toEqual([]);
    expect(bundle.runtimeTools).toEqual([]);
  });

  it("includes the local mock web search as one capability and executable", () => {
    const bundle = createServiceToolBundle({
      workspace,
      runtime: { provider: "fake", enableMockWebSearch: true },
    });

    expect(bundle.toolCapabilities.map((capability) => capability.name)).toEqual([
      MOCK_WEB_SEARCH_TOOL_NAME,
    ]);
    expect(bundle.runtimeTools.map((tool) => tool.name)).toEqual([MOCK_WEB_SEARCH_TOOL_NAME]);
  });

  it("rejects duplicate tool registrations", () => {
    const duplicate = createMockWebSearchRegistration();

    expect(() =>
      createServiceToolBundle({
        workspace,
        runtime: { provider: "fake", enableMockWebSearch: true, tools: [duplicate] },
      }),
    ).toThrow(ServiceToolRegistryError);
  });

  it("keeps capability and executable from one registration in lockstep", () => {
    const bundle = createServiceToolBundle({
      workspace,
      runtime: {
        provider: "fake",
        tools: [
          createServiceToolRegistration({
            capability: {
              name: "weather.lookup",
              description: "Look up the weather.",
              inputSchema: { type: "object" },
            },
            runtimeTool: {
              name: "weather.lookup",
              description: "Look up the weather.",
              inputSchema: { type: "object" },
              execute: () => Effect.succeed({ temperature: 21 }),
            },
            defaultEnabled: true,
          }),
        ],
      },
    });

    expect(bundle.toolCapabilities.map((capability) => capability.name)).toEqual([
      "weather.lookup",
    ]);
    expect(bundle.runtimeTools.map((tool) => tool.name)).toEqual(["weather.lookup"]);
  });

  it("isolates runtime access when one registration is reused by two tool registries", async () => {
    const sharedRegistration = createMockWebSearchRegistration({ delayMs: 0, resultCount: 1 });
    const first = createServiceToolBundle({
      workspace,
      runtime: { provider: "fake", tools: [sharedRegistration] },
    });
    const second = createServiceToolBundle({
      workspace,
      runtime: { provider: "fake", tools: [sharedRegistration] },
    });

    first.registry.bindRuntime(searchRuntime("First composition"));
    second.registry.bindRuntime(searchRuntime("Second composition"));

    await expect(runSearch(first, "shared registration")).resolves.toMatchObject({
      results: [{ title: "First composition" }],
    });
    await expect(runSearch(second, "shared registration")).resolves.toMatchObject({
      results: [{ title: "Second composition" }],
    });
  });
});

const SEARCH_TOOL_CONTEXT: RuntimeToolContext = {
  requestId: "request_tool_registry",
  assistantTurnId: "assistant_turn_tool_registry",
  providerId: "fake",
  modelId: "fake-echo",
  toolName: MOCK_WEB_SEARCH_TOOL_NAME,
  scope: {
    hostAppId: "host_tool_registry",
    workspaceId: workspace.workspaceId,
    subjectId: "subject_tool_registry",
    conversationId: "conversation_tool_registry",
    assistantTurnId: "assistant_turn_tool_registry",
  },
};

const searchRuntime = (title: string): AgentRuntime => ({
  streamEffect: (request) =>
    Stream.succeed({
      type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence: 0,
      content: JSON.stringify([{ title, url: "https://example.test", snippet: "result" }]),
    } satisfies RuntimeEvent),
});

const runSearch = (
  bundle: ReturnType<typeof createServiceToolBundle>,
  query: string,
): Promise<unknown> => {
  const [tool] = bundle.runtimeTools;
  if (!tool) throw new Error("Expected the mock web search runtime tool.");
  return Effect.runPromise(tool.execute({ query }, SEARCH_TOOL_CONTEXT));
};
