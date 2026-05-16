import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  protocolArtifacts,
  encodeSseEvent,
  parseSseEvent,
  encodeSseFrame,
  protocolLinePrefix,
  SidechatStreamEvent,
  parseKnownSsePayloads,
  parseSsePayload,
  SidechatProtocolHeader,
  validateRequest,
  validateRequestHeaders,
  parseSidechatRequest,
  parseSidechatRequestHeaders,
  parseSidechatResponseHeaders,
  parseSidechatStreamEvent,
  parseHostCommand,
  validateStreamEvent,
} from "../src";
import { validateSidechatEventSequence } from "../src/sidechat.v1/sequence";

describe("sidechat protocol v1 fixtures", () => {
  const fixturesDir = path.resolve(
    fileURLToPath(new URL("../src/sidechat.v1/fixtures", import.meta.url)),
  );

  test("success fixture validates", () => {
    const raw = JSON.parse(
      readFileSync(path.join(fixturesDir, "success-stream.json"), "utf8"),
    );
    expect(raw.protocol).toBe("sidechat.v1");
    for (const event of raw.events) {
      expect(parseSidechatStreamEvent(event)).toBeTruthy();
    }
  });

  test("error fixture validates", () => {
    const raw = JSON.parse(
      readFileSync(path.join(fixturesDir, "error-stream.json"), "utf8"),
    );
    expect(raw.protocol).toBe(protocolArtifacts.protocol);
    for (const event of raw.events) {
      expect(parseSidechatStreamEvent(event)).toBeTruthy();
    }
  });

  test("request schema requires workspace and message content", () => {
    const valid = {
      workspaceId: "demo-workspace",
      message: { id: "m1", role: "user", content: "hi" },
      model: { provider: "openai", id: "gpt-4.1-mini" },
    };

    const parsed = parseSidechatRequest(valid);
    expect(parsed.workspaceId).toBe("demo-workspace");
  });

  test("request schema accepts host context snapshots", () => {
    const parsed = parseSidechatRequest({
      workspaceId: "demo-workspace",
      message: { id: "m1", role: "user", content: "filter the grid" },
      model: { provider: "openai", id: "gpt-4.1-mini" },
      hostContext: {
        pageId: "advisory-workbench",
        title: "Advisory Workbench",
        resources: [
          {
            id: "clientPortfolio",
            kind: "grid",
            label: "Client Portfolio Review",
            rowCount: 250,
            columns: [
              {
                id: "riskScore",
                label: "Risk Score",
                type: "number",
                sortable: true,
                filterable: true,
              },
            ],
          },
        ],
        capabilities: [
          {
            id: "grid-view-control",
            label: "Grid view control",
            commandTypes: ["grid.applyView", "grid.clearView"],
          },
        ],
      },
    });

    expect(parsed.hostContext?.resources?.[0]?.id).toBe("clientPortfolio");
  });

  test("host command schema validates grid view commands", () => {
    expect(
      parseHostCommand({
        type: "grid.applyView",
        resourceId: "clientPortfolio",
        view: {
          filters: [
            {
              columnId: "riskScore",
              operator: "greaterThanOrEqual",
              value: 80,
            },
            {
              columnId: "dueDate",
              operator: "notBlank",
            },
          ],
          sort: [{ columnId: "riskScore", direction: "desc" }],
          highlightRowIds: ["row-1", "row-2"],
        },
      }),
    ).toMatchObject({
      type: "grid.applyView",
      resourceId: "clientPortfolio",
    });
  });

  test("stream schema validates host command events", () => {
    expect(
      parseSidechatStreamEvent({
        type: "sidechat.host_command",
        requestId: "req-1",
        messageId: "msg-asst-1",
        commandId: "command-1",
        command: {
          type: "grid.applyView",
          resourceId: "clientPortfolio",
          view: {
            sort: [{ columnId: "riskScore", direction: "desc" }],
          },
        },
        index: 0,
      }),
    ).toMatchObject({
      type: "sidechat.host_command",
      commandId: "command-1",
    });
  });

  test("stream schema accepts completed assistant metadata", () => {
    expect(
      parseSidechatStreamEvent({
        type: "sidechat.completed",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-asst",
        model: { provider: "openai", id: "gpt-4.1-mini" },
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
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
      }),
    ).toMatchObject({
      type: "sidechat.completed",
      metadata: {
        citations: [
          {
            sourceId: "advisoryWorklist:review-global-medtech-inc",
          },
        ],
      },
    });
  });

  test("sse encode/decode roundtrip for delta and completed events", () => {
    const parsed = parseSidechatRequest({
      workspaceId: "demo-workspace",
      message: { id: "m-1", role: "user", content: "ping" },
      model: { provider: "openai", id: "gpt-4.1-mini" },
    });
    expect(parsed.workspaceId).toBe("demo-workspace");

    const payload = {
      type: "sidechat.delta",
      requestId: "req-1",
      messageId: "msg-1",
      content: "Hi",
      index: 0,
    } as const;

    const line = encodeSseEvent(payload);
    expect(line.startsWith(`${protocolLinePrefix} `)).toBe(true);
    expect(parseSseEvent(line)).toEqual(payload);

    const frame = encodeSseFrame({
      ...payload,
      type: "sidechat.delta",
    });
    expect(frame.includes("event: sidechat.delta")).toBe(true);
  });

  test("stream validator accepts valid success sequence", () => {
    const sequence: SidechatStreamEvent[] = [
      {
        type: "sidechat.started",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-asst",
        model: { provider: "openai", id: "gpt-4.1-mini" },
      },
      {
        type: "sidechat.delta",
        requestId: "req-1",
        messageId: "msg-asst",
        content: "x",
        index: 0,
      },
      {
        type: "sidechat.completed",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-asst",
        model: { provider: "openai", id: "gpt-4.1-mini" },
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    ];

    expect(validateSidechatEventSequence(sequence)).toEqual({ ok: true });
  });

  test("stream validator accepts valid error terminal sequence", () => {
    const sequence: SidechatStreamEvent[] = [
      {
        type: "sidechat.started",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-asst",
        model: { provider: "openai", id: "gpt-4.1-mini" },
      },
      {
        type: "sidechat.error",
        requestId: "req-1",
        code: "InternalError",
        message: "fail",
        retryable: false,
      },
    ];

    expect(validateSidechatEventSequence(sequence)).toEqual({ ok: true });
  });

  test("stream validator rejects empty sequence", () => {
    const result = validateSidechatEventSequence([]);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "empty" });
  });

  test("stream validator rejects terminal event without request id", () => {
    const result = validateSidechatEventSequence([
      {
        type: "sidechat.error",
        code: "InternalError",
        message: "fail",
        retryable: false,
      } as unknown as SidechatStreamEvent,
    ]);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "terminal_request_id_missing" });
  });

  test("stream validator rejects started after terminal", () => {
    const result = validateSidechatEventSequence([
      {
        type: "sidechat.error",
        requestId: "req-1",
        code: "InternalError",
        message: "fail",
        retryable: false,
      },
      {
        type: "sidechat.started",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-asst",
        model: { provider: "openai", id: "gpt-4.1-mini" },
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "delta_after_terminal" });
  });

  test("stream validator rejects prior request id mismatch before terminal", () => {
    const result = validateSidechatEventSequence([
      {
        type: "sidechat.started",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-asst",
        model: { provider: "openai", id: "gpt-4.1-mini" },
      },
      {
        type: "sidechat.delta",
        requestId: "req-2",
        messageId: "msg-asst",
        content: "x",
        index: 0,
      },
      {
        type: "sidechat.completed",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-asst",
        model: { provider: "openai", id: "gpt-4.1-mini" },
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "terminal_request_mismatch" });
  });

  test("stream validator requires terminal event", () => {
    const events = [
      {
        type: "sidechat.started",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-user",
        model: { provider: "openai", id: "gpt-4.1-mini" },
      },
      {
        type: "sidechat.delta",
        requestId: "req-1",
        messageId: "msg-asst",
        content: "x",
        index: 0,
      },
    ];

    const result = validateSidechatEventSequence(events);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "missing_terminal_event" });
  });

  test("stream validator rejects multiple terminal events", () => {
    const started = {
      type: "sidechat.started",
      requestId: "req-1",
      conversationId: "conv",
      messageId: "msg-user",
      model: { provider: "openai", id: "gpt-4.1-mini" },
    } as const;

    const completed = {
      type: "sidechat.completed",
      requestId: "req-1",
      conversationId: "conv",
      messageId: "msg-asst",
      model: { provider: "openai", id: "gpt-4.1-mini" },
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    } as const;

    const error = {
      type: "sidechat.error",
      requestId: "req-1",
      code: "ERR",
      message: "fail",
      retryable: true,
    } as const;

    const result = validateSidechatEventSequence([
      started as SidechatStreamEvent,
      completed,
      error,
    ]);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "multiple_terminal_events" });
  });

  test("stream validator rejects multiple started events", () => {
    const started = {
      type: "sidechat.started",
      requestId: "req-1",
      conversationId: "conv",
      messageId: "msg-user",
      model: { provider: "openai", id: "gpt-4.1-mini" },
    } as const;

    const completed = {
      type: "sidechat.completed",
      requestId: "req-1",
      conversationId: "conv",
      messageId: "msg-asst",
      model: { provider: "openai", id: "gpt-4.1-mini" },
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    } as const;

    const result = validateSidechatEventSequence([started, completed, started]);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "multiple_started_events" });
  });

  test("stream validator rejects deltas after terminal", () => {
    const sequence: SidechatStreamEvent[] = [
      {
        type: "sidechat.started",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-user",
        model: { provider: "openai", id: "gpt-4.1-mini" },
      },
      {
        type: "sidechat.completed",
        requestId: "req-1",
        conversationId: "conv",
        messageId: "msg-asst",
        model: { provider: "openai", id: "gpt-4.1-mini" },
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
      {
        type: "sidechat.delta",
        requestId: "req-1",
        messageId: "msg-asst",
        content: "x",
        index: 1,
      },
    ];

    const result = validateSidechatEventSequence(sequence);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "delta_after_terminal" });
  });

  test("sse parser ignores unknown event types and recovers only known known events", () => {
    const chunk = [
      "event: sidechat.delta",
      'data: {"type":"sidechat.delta","requestId":"r1","messageId":"m1","content":"A","index":0}',
      "",
      "event: sidechat.unknown",
      'data: {"foo":1}',
      "",
      `data: {"type":"sidechat.completed","requestId":"r1","conversationId":"c1","messageId":"m2","model":{"provider":"openai","id":"gpt-4.1-mini"},"finishReason":"stop","usage":{"inputTokens":1,"outputTokens":2,"totalTokens":3}}`,
      "",
    ].join("\n");

    const payloads = parseSsePayload(chunk);
    expect(payloads.length).toBe(3);
    expect(payloads[1]?.event).toBe("sidechat.unknown");

    const events = parseKnownSsePayloads(chunk);
    expect(events.length).toBe(2);
    expect(events[0]?.type).toBe("sidechat.delta");
    expect(events[1]?.type).toBe("sidechat.completed");
  });

  test("request headers validate required protocol header", () => {
    expect(() =>
      parseSidechatRequestHeaders({
        [SidechatProtocolHeader]: "sidechat.v1",
      }),
    ).not.toThrow();
  });

  test("response headers validate stream contract", () => {
    expect(() =>
      parseSidechatResponseHeaders({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Sidechat-Protocol": "sidechat.v1",
        "X-Request-Id": "req-1",
      }),
    ).not.toThrow();
  });

  test("terminal validation rejects invalid terminal request id consistency", () => {
    const result = validateSidechatEventSequence([
      {
        type: "sidechat.started",
        requestId: "req-1",
        conversationId: "c1",
        messageId: "m1",
        model: { provider: "openai", id: "gpt-4.1-mini" },
      },
      {
        type: "sidechat.completed",
        requestId: "req-2",
        conversationId: "c1",
        messageId: "m2",
        model: { provider: "openai", id: "gpt-4.1-mini" },
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    ]);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "terminal_request_mismatch" });
  });

  test("shared validation helpers expose schema result", () => {
    const reqResult = validateRequest({
      workspaceId: "demo-workspace",
      message: { id: "m1", role: "user", content: "hi" },
      model: { provider: "openai", id: "gpt-4.1-mini" },
    });
    expect(reqResult.ok).toBe(true);

    const headerResult = validateRequestHeaders({
      "X-Sidechat-Protocol": "sidechat.v1",
      "Content-Type": "application/json",
    } as Record<string, string>);
    expect(headerResult.ok).toBe(true);

    const eventResult = validateStreamEvent({
      type: "sidechat.started",
      requestId: "req-1",
      conversationId: "c1",
      messageId: "m1",
      model: { provider: "openai", id: "gpt-4.1-mini" },
    });
    expect(eventResult.ok).toBe(true);

    const badEventResult = validateStreamEvent({
      type: "sidechat.unknown",
    } as unknown);
    expect(badEventResult.ok).toBe(false);
  });
});
