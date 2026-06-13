import { Effect, Stream } from "effect";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import {
  createFakeProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
} from "#providers/fake/fake-model-provider";
import type { ModelProvider } from "#providers/model-provider";
import { createScriptedLanguageModel } from "#testing/scripted-language-model";
import { createMockWebSearchTool, MOCK_WEB_SEARCH_TOOL_NAME } from "#testing/mock-runtime-tool";
import { RUNTIME_ERROR_CODES } from "./contract/runtime-event.js";
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

  it("rejects unavailable selected tools without fallback", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          runtime.streamEffect({
            providerId: FAKE_PROVIDER_ID,
            modelId: FAKE_ECHO_MODEL_ID,
            requestId: "req_missing_tool",
            assistantTurnId: "turn_missing_tool",
            messages: [],
            availableToolNames: ["missing_tool"],
          }),
        ),
      ),
    ).rejects.toThrow("tool missing_tool is not registered");
  });

  it("rejects unavailable provider and model selections without fallback", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          runtime.streamEffect({
            providerId: "missing-provider",
            modelId: FAKE_ECHO_MODEL_ID,
            requestId: "req_missing_provider",
            assistantTurnId: "turn_missing_provider",
            messages: [],
          }),
        ),
      ),
    ).rejects.toThrow("provider missing-provider is not registered");

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          runtime.streamEffect({
            providerId: FAKE_PROVIDER_ID,
            modelId: "missing-model",
            requestId: "req_missing_model",
            assistantTurnId: "turn_missing_model",
            messages: [],
          }),
        ),
      ),
    ).rejects.toThrow("model missing-model is not registered");
  });

  it("maps unexpected adapter throws into the runtime error channel", async () => {
    const runtime = createAgentRuntime({
      providers: [createThrowingProvider()],
    });

    await expect(
      collectEvents(
        Stream.toAsyncIterable(
          runtime.streamEffect({
            providerId: "throwing",
            modelId: "throwing-model",
            requestId: "req_throwing_provider",
            assistantTurnId: "turn_throwing_provider",
            messages: [],
          }),
        ),
      ),
    ).rejects.toMatchObject({
      code: RUNTIME_ERROR_CODES.INTERNAL_ERROR,
      message: "provider adapter exploded",
    });
  });
});

const createCapturingProvider = (modelCalls: LanguageModelV3CallOptions[]): ModelProvider => ({
  providerId: "capture",
  modelIds: ["capture-model"],
  resolveModel: (selection) =>
    Effect.succeed(
      createScriptedLanguageModel({
        providerId: "capture",
        modelId: selection.modelId,
        text: "Captured response.",
        onStreamCall: (options) => modelCalls.push(options),
      }),
    ),
});

const createThrowingProvider = (): ModelProvider => ({
  providerId: "throwing",
  modelIds: ["throwing-model"],
  resolveModel: () => {
    throw new Error("provider adapter exploded");
  },
});

const collectEvents = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};
