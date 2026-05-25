import { describe, expect, it } from "vitest";
import { createAgentRuntime } from "#runtime/agent-runtime";
import { isRuntimeTerminalEvent } from "#runtime/contract/runtime-event";
import { createFakeProvider, FAKE_ECHO_MODEL_ID, FAKE_PROVIDER_ID } from "./fake-model-provider.js";

describe("createFakeProvider", () => {
  it("resolves a deterministic fake model for the runtime orchestrator", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });
    const events = await collectEvents(
      runtime.stream({
        requestId: "req_001",
        assistantTurnId: "turn_001",
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        messages: [{ role: "user", content: "hello runtime" }],
      }),
    );

    expect(events[0]?.type).toBe("runtime.started");
    expect(events[1]).toMatchObject({
      type: "runtime.activity",
      activityKind: "reasoning",
      title: "Selected deterministic echo script",
    });
    expect(events.filter((event) => event.type === "runtime.activity")).toHaveLength(2);
    expect(
      events
        .filter((event) => event.type === "runtime.output_delta")
        .map((event) => event.content)
        .join(""),
    ).toBe("Fake response: hello runtime");
    expect(events[0]).toMatchObject({
      providerId: FAKE_PROVIDER_ID,
      modelId: FAKE_ECHO_MODEL_ID,
      sequence: 0,
    });
    expect(events.at(-1)).toMatchObject({
      type: "runtime.completed",
      sequence: 10,
    });
  });

  it("emits exactly one terminal event", async () => {
    const runtime = createAgentRuntime({
      providers: [createFakeProvider()],
    });
    const events = await collectEvents(
      runtime.stream({
        requestId: "req_002",
        assistantTurnId: "turn_002",
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        messages: [],
      }),
    );

    expect(events.filter(isRuntimeTerminalEvent)).toHaveLength(1);
  });
});

const collectEvents = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};
