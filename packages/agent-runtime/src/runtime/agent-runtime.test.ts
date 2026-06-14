import { Stream } from "effect";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import {
  createFakeProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
} from "#providers/fake/fake-model-provider";
import { createMockWebSearchTool, MOCK_WEB_SEARCH_TOOL_NAME } from "#testing/mock-runtime-tool";
import { collectEvents, createCapturingProvider } from "#testing/agent-runtime-test-support";
import { createAgentRuntime } from "./agent-runtime.js";

describe("createAgentRuntime", () => {
  it("streams internal events by resolving a model provider through the runtime", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });
    const events = await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect({
          providerId: FAKE_PROVIDER_ID,
          modelId: FAKE_ECHO_MODEL_ID,
          requestId: "req_001",
          assistantTurnId: "turn_001",
          messages: [{ role: "user", content: "map me later" }],
        }),
      ),
    );

    expect(events[0]?.type).toBe("runtime.started");
    expect(events.at(-1)?.type).toBe("runtime.completed");
    expect(events.every((event) => event.requestId === "req_001")).toBe(true);
  });

  it("exposes an Effect stream as the first-class runtime surface", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });

    const events = await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect({
          providerId: FAKE_PROVIDER_ID,
          modelId: FAKE_ECHO_MODEL_ID,
          requestId: "req_effect",
          assistantTurnId: "turn_effect",
          messages: [{ role: "user", content: "effect stream" }],
        }),
      ),
    );

    expect(events[0]?.type).toBe("runtime.started");
    expect(events.at(-1)?.type).toBe("runtime.completed");
  });

  it("renders profile instructions and context board before model execution", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      profiles: [
        {
          profileId: "analyst",
          systemInstructions: "Use concise analyst language.",
          defaultProviderId: "capture",
          defaultModelId: "capture-model",
        },
      ],
    });

    await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect({
          profileId: "analyst",
          requestId: "req_context",
          assistantTurnId: "turn_context",
          messages: [{ role: "user", content: "respond in list" }],
          contextBoard: {
            sections: [
              {
                title: "Portfolio",
                content: "Risk budget is tight.",
                priority: 10,
              },
            ],
          },
        }),
      ),
    );

    expect(modelCalls[0]?.prompt[0]).toMatchObject({
      role: "system",
      content: "Use concise analyst language.",
    });
    expect(modelCalls[0]?.prompt[1]).toMatchObject({
      role: "system",
      content: expect.stringContaining("Trusted context board"),
    });
    expect(modelCalls[0]?.prompt[1]).toMatchObject({
      content: expect.stringContaining("Risk budget is tight."),
    });
    expect(modelCalls[0]?.prompt.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "respond in list" }],
    });
  });

  it("uses resolved request instructions when core supplies them for the turn", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      profiles: [
        {
          profileId: "analyst",
          systemInstructions: "Use catalog fallback instructions.",
          defaultProviderId: "capture",
          defaultModelId: "capture-model",
        },
      ],
    });

    await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect({
          profileId: "analyst",
          requestId: "req_resolved_instructions",
          assistantTurnId: "turn_resolved_instructions",
          systemInstructions: "Use resolved host profile instructions.",
          messages: [{ role: "user", content: "answer from resolved prompt" }],
        }),
      ),
    );

    expect(modelCalls[0]?.prompt[0]).toMatchObject({
      role: "system",
      content: "Use resolved host profile instructions.",
    });
  });

  it("selects app-owned tools without executing them before the model chooses them", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const tool = {
      ...createMockWebSearchTool(),
      execute: () => {
        throw new Error("The runtime must not execute tools before provider streaming.");
      },
    };
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      tools: [tool],
    });

    const events = await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect({
          providerId: "capture",
          modelId: "capture-model",
          requestId: "req_003",
          assistantTurnId: "turn_003",
          messages: [{ role: "user", content: "search web for portfolio news" }],
          availableToolNames: [MOCK_WEB_SEARCH_TOOL_NAME],
        }),
      ),
    );

    expect(events[0]).toMatchObject({ type: "runtime.started" });
    expect(events.at(-1)).toMatchObject({ type: "runtime.completed" });
    expect(modelCalls[0]?.tools?.map((runtimeTool) => runtimeTool.name)).toEqual([
      MOCK_WEB_SEARCH_TOOL_NAME,
    ]);
  });

  it("passes only per-turn allowed tools from a larger executable registry to the provider", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      tools: [
        createMockWebSearchTool(),
        {
          ...createMockWebSearchTool(),
          name: "admin_lookup",
          description: "Look up privileged admin data.",
        },
      ],
    });

    await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect({
          providerId: "capture",
          modelId: "capture-model",
          requestId: "req_larger_registry",
          assistantTurnId: "turn_larger_registry",
          messages: [{ role: "user", content: "search public sources" }],
          availableToolNames: [MOCK_WEB_SEARCH_TOOL_NAME],
        }),
      ),
    );

    expect(modelCalls[0]?.tools?.map((runtimeTool) => runtimeTool.name)).toEqual([
      MOCK_WEB_SEARCH_TOOL_NAME,
    ]);
  });

  it("exposes no tools when a turn has no explicit request or profile allowlist", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      tools: [createMockWebSearchTool()],
    });

    await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect({
          providerId: "capture",
          modelId: "capture-model",
          requestId: "req_no_tools",
          assistantTurnId: "turn_no_tools",
          messages: [{ role: "user", content: "Can you search?" }],
        }),
      ),
    );

    expect(modelCalls[0]?.tools).toBeUndefined();
  });

  it("treats an empty request allowlist as an explicit no-tools decision", async () => {
    const modelCalls: LanguageModelV3CallOptions[] = [];
    const runtime = createAgentRuntime({
      providers: [createCapturingProvider(modelCalls)],
      tools: [createMockWebSearchTool()],
    });

    await collectEvents(
      Stream.toAsyncIterable(
        runtime.streamEffect({
          providerId: "capture",
          modelId: "capture-model",
          requestId: "req_empty_tools",
          assistantTurnId: "turn_empty_tools",
          messages: [{ role: "user", content: "Can you search?" }],
          availableToolNames: [],
        }),
      ),
    );

    expect(modelCalls[0]?.tools).toBeUndefined();
  });
});
