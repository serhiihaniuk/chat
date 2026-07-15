export function completedTurnResponse(): Response {
  return eventResponse(
    [
      { type: "start", messageId: "assistant-1" },
      { type: "start-step" },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "Answer" },
      { type: "text-end", id: "text-1" },
      { type: "finish-step" },
      {
        type: "finish",
        messageMetadata: {
          usage: {
            inputTokens: 2,
            outputTokens: 3,
            totalTokens: 5,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
          terminal: { status: "completed", finishReason: "stop" },
        },
      },
    ]
      .map(toSseData)
      .join("") + "data: [DONE]\n\n",
  );
}

export function openTurnResponse(signal: AbortSignal | undefined): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          [
            { type: "start", messageId: "assistant-1" },
            { type: "start-step" },
            { type: "text-start", id: "text-1" },
            { type: "text-delta", id: "text-1", delta: "Partial" },
          ]
            .map(toSseData)
            .join(""),
        ),
      );
      signal?.addEventListener("abort", () => controller.error(signal.reason), {
        once: true,
      });
    },
  });
  return eventResponse(body);
}

export function controllableTurnResponse(): Readonly<{
  response: Response;
  finish: () => void;
}> {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const response = eventResponse(
    new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(
          encoder.encode(
            [
              { type: "start", messageId: "assistant-1" },
              { type: "start-step" },
              { type: "text-start", id: "text-1" },
              { type: "text-delta", id: "text-1", delta: "Partial" },
            ]
              .map(toSseData)
              .join(""),
          ),
        );
      },
    }),
  );
  return {
    response,
    finish: () => finishControlledTurn(streamController, encoder),
  };
}

export function cancellableTurnResponse(): Readonly<{
  response: Response;
  confirmCancelled: () => void;
}> {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const response = eventResponse(
    new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
        controller.enqueue(
          encoder.encode(
            [
              { type: "start", messageId: "assistant-1" },
              { type: "start-step" },
              { type: "text-start", id: "text-1" },
              { type: "text-delta", id: "text-1", delta: "Partial" },
            ]
              .map(toSseData)
              .join(""),
          ),
        );
      },
    }),
  );
  return {
    response,
    confirmCancelled: () => {
      if (!streamController) throw new Error("Expected the test stream to be open.");
      streamController.enqueue(
        encoder.encode(
          [
            { type: "text-end", id: "text-1" },
            { type: "finish-step" },
            {
              type: "finish",
              messageMetadata: {
                usage: {
                  inputTokens: 0,
                  outputTokens: 0,
                  totalTokens: 0,
                  reasoningTokens: 0,
                  cachedInputTokens: 0,
                },
                terminal: { status: "cancelled" },
              },
            },
          ]
            .map(toSseData)
            .join("") + "data: [DONE]\n\n",
        ),
      );
      streamController.close();
    },
  };
}

export function blockedTurnResponse(): Response {
  return eventResponse(
    [
      { type: "start", messageId: "assistant-1" },
      { type: "start-step" },
      { type: "finish-step" },
      { type: "finish", finishReason: "content-filter" },
    ]
      .map(toSseData)
      .join("") + "data: [DONE]\n\n",
  );
}

export function interruptedTurnResponse(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("network down after acceptance"));
    },
  });
  return eventResponse(body);
}

export function approvalTurnResponse(): Response {
  return eventResponse(
    [
      { type: "start", messageId: "assistant-1" },
      { type: "start-step" },
      {
        type: "tool-input-available",
        toolCallId: "tool-call-1",
        toolName: "needs_access",
        input: { resourceId: "doc-1" },
      },
      {
        type: "tool-approval-request",
        approvalId: "approval-1",
        toolCallId: "tool-call-1",
      },
      { type: "finish-step" },
      { type: "finish" },
    ]
      .map(toSseData)
      .join("") + "data: [DONE]\n\n",
  );
}

export function readSentMessageIds(body: BodyInit | null | undefined): string[] {
  const parsed: unknown = JSON.parse(requestBodyText(body));
  if (!isRecord(parsed) || !Array.isArray(parsed["messages"])) {
    throw new Error("Expected a workflow chat request with messages.");
  }
  return parsed["messages"].map(readMessageId);
}

export function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

export function requestBodyText(body: BodyInit | null | undefined): string {
  if (typeof body === "string") return body;
  throw new Error("Expected a JSON request body.");
}

function finishControlledTurn(
  controller: ReadableStreamDefaultController<Uint8Array> | undefined,
  encoder: TextEncoder,
): void {
  if (!controller) throw new Error("Expected the test stream to be open.");
  controller.enqueue(
    encoder.encode(
      [
        { type: "text-delta", id: "text-1", delta: " answer" },
        { type: "text-end", id: "text-1" },
        { type: "finish-step" },
        { type: "finish" },
      ]
        .map(toSseData)
        .join("") + "data: [DONE]\n\n",
    ),
  );
  controller.close();
}

function eventResponse(body: BodyInit): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
      "x-workflow-run-id": "run-1",
    },
  });
}

function toSseData(chunk: unknown): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function readMessageId(message: unknown): string {
  if (!isRecord(message) || typeof message["id"] !== "string") {
    throw new Error("Expected every workflow chat message to have an id.");
  }
  return message["id"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
