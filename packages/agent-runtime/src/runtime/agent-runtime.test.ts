import { describe, expect, it } from "vitest";
import { createFakeProvider, FAKE_ECHO_MODEL_ID, FAKE_PROVIDER_ID } from "#fake/fake-provider";
import { createMockWebSearchTool, MOCK_WEB_SEARCH_TOOL_NAME } from "#tools/mock-web-search";
import type { RuntimeRequest } from "../provider.js";
import { createAgentRuntime } from "./agent-runtime.js";

describe("createAgentRuntime", () => {
  it("streams internal events from the selected provider", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });
    const events = await collectEvents(
      runtime.stream({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        requestId: "req_001",
        assistantTurnId: "turn_001",
        messages: [{ role: "user", content: "map me later" }],
      }),
    );

    expect(events[0]?.type).toBe("runtime.started");
    expect(events.at(-1)?.type).toBe("runtime.completed");
    expect(events.every((event) => event.requestId === "req_001")).toBe(true);
  });

  it("does not accept request-level tool selection", async () => {
    const runtime = createAgentRuntime({
      providers: [
        createFakeProvider({
          script: (request) => [
            {
              type: "runtime.started",
              requestId: request.requestId,
              assistantTurnId: request.assistantTurnId,
              sequence: 0,
              providerId: FAKE_PROVIDER_ID,
              modelId: FAKE_ECHO_MODEL_ID,
            },
            {
              type: "runtime.completed",
              requestId: request.requestId,
              assistantTurnId: request.assistantTurnId,
              sequence: 1,
              finishReason: "stop",
            },
          ],
        }),
      ],
    });

    const events = await collectEvents(
      runtime.stream({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        requestId: "req_002",
        assistantTurnId: "turn_002",
        messages: [],
      }),
    );

    expect(events.at(-1)?.type).toBe("runtime.completed");
  });

  it("prepends markdown rendering instructions before provider execution", async () => {
    const providerMessages: unknown[] = [];
    const runtime = createAgentRuntime({
      providers: [
        {
          providerId: FAKE_PROVIDER_ID,
          modelIds: [FAKE_ECHO_MODEL_ID],
          async *stream(request) {
            providerMessages.push(...request.messages);
            yield {
              type: "runtime.started",
              requestId: request.requestId,
              assistantTurnId: request.assistantTurnId,
              sequence: 0,
              providerId: FAKE_PROVIDER_ID,
              modelId: FAKE_ECHO_MODEL_ID,
            };
            yield {
              type: "runtime.completed",
              requestId: request.requestId,
              assistantTurnId: request.assistantTurnId,
              sequence: 1,
              finishReason: "stop",
            };
          },
        },
      ],
    });

    await collectEvents(
      runtime.stream({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        requestId: "req_markdown",
        assistantTurnId: "turn_markdown",
        messages: [{ role: "user", content: "respond in list" }],
      }),
    );

    expect(providerMessages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("GitHub-flavored Markdown"),
    });
    expect(providerMessages[1]).toMatchObject({ role: "user", content: "respond in list" });
  });

  it("exposes tools to the selected provider without running them before the model", async () => {
    const providerRequests: RuntimeRequest[] = [];
    const tool = {
      ...createMockWebSearchTool({ delayMs: 0 }),
      run: () => {
        throw new Error("The runtime must not execute tools before provider streaming.");
      },
    };
    const runtime = createAgentRuntime({
      providers: [
        {
          providerId: FAKE_PROVIDER_ID,
          modelIds: [FAKE_ECHO_MODEL_ID],
          async *stream(request) {
            providerRequests.push(request);
            yield {
              type: "runtime.started",
              requestId: request.requestId,
              assistantTurnId: request.assistantTurnId,
              sequence: 0,
              providerId: FAKE_PROVIDER_ID,
              modelId: FAKE_ECHO_MODEL_ID,
            };
            yield {
              type: "runtime.completed",
              requestId: request.requestId,
              assistantTurnId: request.assistantTurnId,
              sequence: 1,
              finishReason: "stop",
            };
          },
        },
      ],
      tools: [tool],
    });

    const events = await collectEvents(
      runtime.stream({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        requestId: "req_003",
        assistantTurnId: "turn_003",
        messages: [{ role: "user", content: "search web for portfolio news" }],
      }),
    );

    expect(events).toMatchObject([{ type: "runtime.started" }, { type: "runtime.completed" }]);
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0]?.tools?.map((runtimeTool) => runtimeTool.name)).toEqual([
      MOCK_WEB_SEARCH_TOOL_NAME,
    ]);
    expect(providerRequests[0]?.messages).not.toContainEqual(
      expect.objectContaining({
        content: expect.stringContaining("Backend tool"),
      }),
    );
  });
});

const collectEvents = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};
