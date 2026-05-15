import { describe, expect, it } from "vitest";
import {
  encodeSse,
  encodeSseEventFrame,
  goldenErrorEvents,
  goldenSuccessEvents,
  parseSseFrames,
  protocolVersion,
  streamRequestSchema,
  validateSidechatEventSequence,
} from "../index.js";

describe("sidechat protocol", () => {
  it("validates required request fields", () => {
    expect(() =>
      streamRequestSchema.parse({
        workspaceId: "demo-workspace",
        message: { id: "m1", role: "user", content: "hi" },
        model: { provider: "openai", id: "gpt-4.1-mini" },
      }),
    ).not.toThrow();
    expect(() =>
      streamRequestSchema.parse({
        workspaceId: "",
        message: { id: "m1", role: "user", content: "" },
        model: { provider: "openai", id: "" },
      }),
    ).toThrow();
  });

  it("round trips golden SSE frames with one terminal event", () => {
    const parsed = parseSseFrames(goldenSuccessEvents.map(encodeSse).join(""));
    expect(protocolVersion).toBe("sidechat.v1");
    expect(parsed.map((event) => event.type)).toEqual([
      "sidechat.started",
      "sidechat.delta",
      "sidechat.delta",
      "sidechat.completed",
    ]);
    expect(
      parsed.filter(
        (event) =>
          event.type === "sidechat.completed" ||
          event.type === "sidechat.error",
      ),
    ).toHaveLength(1);
    expect(
      parsed.every((event) => event.requestId === parsed[0]?.requestId),
    ).toBe(true);
    expect(validateSidechatEventSequence(parsed)).toEqual({ ok: true });
  });

  it("round trips golden error SSE frames as a valid terminal sequence", () => {
    const parsed = parseSseFrames(
      goldenErrorEvents.map(encodeSseEventFrame).join("\n"),
    );
    expect(parsed.map((event) => event.type)).toEqual([
      "sidechat.started",
      "sidechat.error",
    ]);
    expect(parsed.at(-1)).toMatchObject({
      type: "sidechat.error",
      code: expect.any(String),
      message: expect.any(String),
      retryable: expect.any(Boolean),
    });
    expect(validateSidechatEventSequence(parsed)).toEqual({ ok: true });
  });
});
