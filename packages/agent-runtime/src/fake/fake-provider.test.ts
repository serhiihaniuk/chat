import { describe, expect, it } from "vitest";
import {
  createFakeProvider,
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
} from "./fake-provider.js";
import { isRuntimeTerminalEvent } from "../events.js";

describe("createFakeProvider", () => {
  it("produces deterministic internal runtime events", async () => {
    const provider = createFakeProvider();
    const events = await collectEvents(
      provider.stream({
        requestId: "req_001",
        assistantTurnId: "turn_001",
        modelId: FAKE_ECHO_MODEL_ID,
        messages: [{ role: "user", content: "hello runtime" }],
      }),
    );

    expect(events.map((event) => event.type)).toEqual([
      "runtime.started",
      "runtime.reasoning",
      "runtime.output_delta",
      "runtime.output_delta",
      "runtime.output_delta",
      "runtime.output_delta",
      "runtime.completed",
    ]);
    expect(events[0]).toMatchObject({
      providerId: FAKE_PROVIDER_ID,
      modelId: FAKE_ECHO_MODEL_ID,
      sequence: 0,
    });
    expect(events.at(-1)).toMatchObject({
      type: "runtime.completed",
      sequence: 6,
    });
  });

  it("emits exactly one terminal event", async () => {
    const provider = createFakeProvider();
    const events = await collectEvents(
      provider.stream({
        requestId: "req_002",
        assistantTurnId: "turn_002",
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
