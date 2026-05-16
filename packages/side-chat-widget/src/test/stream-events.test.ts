import { describe, expect, it } from "vitest";
import {
  encodeSseEventFrame,
  type SidechatStreamEvent,
} from "@side-chat/shared-protocol";
import { readSideChatStreamEvents } from "../adapters/react/use-side-chat.js";

const started: SidechatStreamEvent = {
  type: "sidechat.started",
  requestId: "req-1",
  conversationId: "conv-1",
  messageId: "assistant-1",
  model: { provider: "openai", id: "gpt-4.1-mini" },
};

const completed: SidechatStreamEvent = {
  type: "sidechat.completed",
  requestId: "req-1",
  conversationId: "conv-1",
  messageId: "assistant-1",
  model: { provider: "openai", id: "gpt-4.1-mini" },
  finishReason: "stop",
  usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
};

describe("readSideChatStreamEvents", () => {
  it("emits complete SSE frames while the response body is still streaming", async () => {
    const encoder = new TextEncoder();
    const seen: string[] = [];
    let streamFinished = false;

    let releaseSecondFrame!: () => void;
    const secondFrameReady = new Promise<void>((resolve) => {
      releaseSecondFrame = resolve;
    });

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`${encodeSseEventFrame(started)}\n`));
        void secondFrameReady.then(() => {
          controller.enqueue(
            encoder.encode(`${encodeSseEventFrame(completed)}\n`),
          );
          controller.close();
        });
      },
    });

    const reading = readSideChatStreamEvents(new Response(body), (event) => {
      seen.push(event.type);
    }).then(() => {
      streamFinished = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(streamFinished).toBe(false);
    expect(seen).toEqual(["sidechat.started"]);

    releaseSecondFrame();
    await reading;
    expect(seen).toEqual(["sidechat.started", "sidechat.completed"]);
  });

  it("reports malformed known stream events without dispatching them", async () => {
    const malformed =
      'event: sidechat.delta\ndata: {"type":"sidechat.delta","requestId":"req-1"}\n\n';
    const seen: string[] = [];
    const malformedEvents: string[] = [];

    await readSideChatStreamEvents(
      new Response(malformed),
      (event) => seen.push(event.type),
      (message) => malformedEvents.push(message),
    );

    expect(seen).toEqual([]);
    expect(malformedEvents).toEqual(["Malformed sidechat.delta stream event"]);
  });

  it("does not dispatch events after a terminal stream event", async () => {
    const lateDelta: SidechatStreamEvent = {
      type: "sidechat.delta",
      requestId: "req-1",
      messageId: "assistant-1",
      content: "late",
      index: 99,
    };
    const seen: string[] = [];
    const malformedEvents: string[] = [];

    await readSideChatStreamEvents(
      new Response(
        `${encodeSseEventFrame(started)}\n${encodeSseEventFrame(completed)}\n${encodeSseEventFrame(lateDelta)}\n`,
      ),
      (event) => seen.push(event.type),
      (message) => malformedEvents.push(message),
    );

    expect(seen).toEqual(["sidechat.started", "sidechat.completed"]);
    expect(malformedEvents).toEqual([
      "Ignored sidechat.delta after terminal sidechat stream event",
    ]);
  });

  it("dispatches host command stream events", async () => {
    const hostCommand: SidechatStreamEvent = {
      type: "sidechat.host_command",
      requestId: "req-1",
      messageId: "assistant-1",
      commandId: "command-1",
      command: { type: "ui.focusResource", resourceId: "clientPortfolio" },
      index: 0,
    };
    const seen: string[] = [];
    const body = `${encodeSseEventFrame(started)}\n${encodeSseEventFrame(hostCommand)}\n${encodeSseEventFrame(completed)}\n`;

    await readSideChatStreamEvents(
      new Response(body),
      (event) => seen.push(event.type),
    );

    expect(seen).toEqual([
      "sidechat.started",
      "sidechat.host_command",
      "sidechat.completed",
    ]);
  });

  it("parses completed message metadata for live citations", async () => {
    const completedWithMetadata: SidechatStreamEvent = {
      ...completed,
      metadata: {
        citations: [
          {
            sourceId: "advisoryWorklist:review-global-medtech-inc",
            label: "Portfolio Worklist - Global MedTech Inc.",
            dataset: "client_portfolio_review",
            resourceId: "advisoryWorklist",
            rowId: "review-global-medtech-inc",
          },
        ],
      },
    };
    let seenCompleted: SidechatStreamEvent | undefined;

    await readSideChatStreamEvents(
      new Response(
        `${encodeSseEventFrame(started)}\n${encodeSseEventFrame(completedWithMetadata)}\n`,
      ),
      (event) => {
        if (event.type === "sidechat.completed") {
          seenCompleted = event;
        }
      },
    );

    expect(seenCompleted).toMatchObject({
      type: "sidechat.completed",
      metadata: {
        citations: [
          {
            sourceId: "advisoryWorklist:review-global-medtech-inc",
            resourceId: "advisoryWorklist",
          },
        ],
      },
    });
  });
});
