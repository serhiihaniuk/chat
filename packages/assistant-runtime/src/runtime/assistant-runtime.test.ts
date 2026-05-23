import { describe, expect, it } from "vitest";
import { AssistantRuntimeError } from "../errors.js";
import {
  createFakeProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
} from "../fake/fake-provider.js";
import { createAssistantRuntime } from "./assistant-runtime.js";

describe("createAssistantRuntime", () => {
  it("streams internal events from the selected provider", async () => {
    const runtime = createAssistantRuntime({
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

  it("checks requested tools before model execution", () => {
    const runtime = createAssistantRuntime({
      providers: [createFakeProvider()],
    });

    expect(() =>
      runtime.stream({
        providerId: FAKE_PROVIDER_ID,
        modelId: FAKE_ECHO_MODEL_ID,
        requestId: "req_002",
        assistantTurnId: "turn_002",
        messages: [],
        toolNames: ["missing"],
      }),
    ).toThrow(AssistantRuntimeError);
  });
});

const collectEvents = async <T>(events: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};
