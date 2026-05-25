import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "#domain/authority";
import {
  createRequestCorrelation,
  redactAttributes,
  type ObservabilityRecord,
} from "./observability.js";
import type {
  AgentRuntimePort,
  ClockPort,
  ConversationRepositoryPort,
  IdGeneratorPort,
  RuntimeEvent,
} from "#ports";
import {
  createStreamChatUseCase,
  type StreamChatInput,
} from "#application/stream-chat/stream-chat";

const authContext: AuthContext = {
  tenantId: "tenant_001",
  workspaceId: "workspace_001",
  subject: { subjectId: "subject_001", userId: "user_001" },
  actor: { subjectId: "subject_001", userId: "user_001" },
  roles: ["member"],
  scopes: ["conversation:read", "conversation:write", "message:write"],
  source: "test_authority",
  issuedAt: "2026-05-23T13:00:00.000Z",
};

const input: StreamChatInput = {
  workspace: { tenantId: "tenant_001", workspaceId: "workspace_001" },
  request: {
    protocolVersion: SIDECHAT_PROTOCOL_VERSION,
    requestId: "request_observe_1",
    message: {
      id: "message_001",
      role: "user",
      content: "secret prompt should not be logged",
    },
  },
  authContext,
  providerId: "fake",
  modelId: "fake-echo",
  traceId: "trace-explicit-1",
};

describe("observability redaction and correlation", () => {
  it("redacts prompts, tool data, provider output, and secrets", () => {
    expect(
      redactAttributes({
        requestId: "request_1",
        prompt: "hidden prompt",
        authorization: "Bearer secret",
        tool: { argumentsJson: { query: "hidden query" } },
        provider: { output: "hidden output" },
      }),
    ).toEqual({
      requestId: "request_1",
      prompt: "[redacted]",
      authorization: "[redacted]",
      tool: { argumentsJson: "[redacted]" },
      provider: { output: "[redacted]" },
    });
  });

  it("creates deterministic trace correlation when callers omit trace id", () => {
    expect(createRequestCorrelation({ requestId: "request_1" })).toEqual({
      requestId: "request_1",
      traceId: "trace_request_1",
    });
  });

  it("records lifecycle, provider, latency, and redacted runtime data", async () => {
    const records: ObservabilityRecord[] = [];
    const ports = createObservedPorts(records, [
      {
        type: "runtime.activity",
        requestId: "request_observe_1",
        assistantTurnId: "assistant_turn_001",
        sequence: 0,
        activityId: "tool_001",
        activityKind: "tool",
        status: "running",
        title: "Run search",
        details: {
          tool: {
            toolCallId: "tool_001",
            toolName: "search",
            input: { query: "secret tool query" },
            result: { summary: "secret search result" },
            sources: [{ label: "Secret source", url: "https://secret.example/result" }],
          },
        },
      },
      {
        type: "runtime.error",
        requestId: "request_observe_1",
        assistantTurnId: "assistant_turn_001",
        sequence: 1,
        code: "timeout",
        message: "provider leaked secret detail",
        retryable: true,
      },
    ]);

    const events = await collect(createStreamChatUseCase(ports).stream(input));

    expect(events.at(-1)).toMatchObject({
      type: "sidechat.error",
      code: "timeout",
    });
    expect(records.map((record) => record.lifecycleState)).toEqual([
      "received",
      "started",
      "runtime_event",
      "runtime_event",
      "failed",
    ]);
    expect(records.every((record) => record.requestId === input.request.requestId)).toBe(true);
    expect(records.every((record) => record.traceId === "trace-explicit-1")).toBe(true);
    expect(records.find((record) => record.lifecycleState === "started")).toMatchObject({
      assistantTurnId: "assistant_turn_001",
      providerId: "fake",
      modelId: "fake-echo",
      attributes: {
        prompt: "[redacted]",
      },
    });
    expect(records.find((record) => record.lifecycleState === "runtime_event")).toMatchObject({
      attributes: {
        activityMeta: {
          tool: {
            parametersPresent: true,
            responsePresent: true,
            sourceCount: 1,
            toolCallId: "tool_001",
            toolName: "search",
          },
        },
      },
    });
    expect(JSON.stringify(records)).not.toContain("secret tool query");
    expect(JSON.stringify(records)).not.toContain("secret search result");
    expect(JSON.stringify(records)).not.toContain("secret.example");
    expect(
      records.find(
        (record) =>
          record.lifecycleState === "runtime_event" && record.attributes["errorCode"] === "timeout",
      ),
    ).toMatchObject({
      attributes: { message: "[redacted]" },
    });
    expect(records.at(-1)).toMatchObject({
      lifecycleState: "failed",
      errorCode: "timeout",
      latencyMs: 70,
      attributes: { eventCount: 3 },
    });
  });
});

const createObservedPorts = (
  records: ObservabilityRecord[],
  runtimeEvents: readonly RuntimeEvent[],
) => {
  const clock = createSteppingClock();
  const conversations: ConversationRepositoryPort = {
    ensureConversation: ({ authContext: context, fallbackConversationId }) =>
      Promise.resolve({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        conversationId: fallbackConversationId,
      }),
    appendUserMessage: () => Promise.resolve(),
  };
  const runtime: AgentRuntimePort = {
    stream: async function* () {
      for (const event of runtimeEvents) {
        await Promise.resolve();
        yield event;
      }
    },
  };
  const ids: IdGeneratorPort = {
    nextConversationId: () => "conversation_001",
    nextAssistantTurnId: () => "assistant_turn_001",
    nextEventId: (() => {
      let index = 0;
      return () => {
        index += 1;
        return `event_${index.toString().padStart(3, "0")}`;
      };
    })(),
  };

  return {
    conversations,
    runtime,
    clock,
    ids,
    observability: {
      record: (record: ObservabilityRecord) => {
        records.push(record);
      },
    },
  };
};

const createSteppingClock = (): ClockPort => {
  let tick = -1;
  return {
    now: () => {
      tick += 1;
      return new Date(Date.UTC(2026, 4, 23, 13, 0, 0, tick * 10)).toISOString();
    },
  };
};

const collect = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
};
