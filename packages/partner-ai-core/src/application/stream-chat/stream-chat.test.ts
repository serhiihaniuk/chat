import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  validateSidechatEventSequence,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { AUTHORITY_DENIAL_CODES, type AuthContext } from "#domain/authority";
import {
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type AgentRuntimePort,
  type ClockPort,
  type ConversationRepositoryPort,
  type IdGeneratorPort,
  type RuntimeEvent,
} from "#ports";
import {
  denyRequestPolicy,
  POLICY_DENIAL_CODES,
  type PolicyEvaluationInput,
  type PolicyPort,
} from "#policies/policy";
import { createPartnerAiCoreLayer } from "#services/effect-runtime";
import { streamChatEffect, type StreamChatInput } from "./stream-chat.js";

const authContext: AuthContext = {
  tenantId: "tenant_001",
  workspaceId: "workspace_001",
  subject: { subjectId: "subject_001", userId: "user_001" },
  actor: { subjectId: "subject_001", userId: "user_001" },
  roles: ["member"],
  scopes: ["conversation:read", "conversation:write", "message:write"],
  source: "test_authority",
  hostOrigin: "https://host.example",
  issuedAt: "2026-05-23T13:00:00.000Z",
};

const request: ChatStreamRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_001",
  message: { id: "message_001", role: "user", content: "hello" },
};

const input: StreamChatInput = {
  workspace: { tenantId: "tenant_001", workspaceId: "workspace_001" },
  request,
  authContext,
  providerId: "fake",
  modelId: "fake-echo",
};

describe("stream chat use case", () => {
  it("streams valid sidechat.v1 events through Effect services", async () => {
    const ports = createFakePorts({ authContext });

    const events = await collect(runStreamChat(input, ports));

    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.ACTIVITY,
      SIDECHAT_EVENT_TYPES.DELTA,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(validateSidechatEventSequence(events).terminalEvent.type).toBe(
      SIDECHAT_EVENT_TYPES.COMPLETED,
    );
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
    expect(ports.calls).toEqual(["policy", "ensureConversation", "appendUserMessage", "runtime"]);
  });

  it("requires normalized AuthContext before protected work", async () => {
    const ports = createFakePorts();

    await expect(
      collect(runStreamChat({ ...input, authContext: undefined }, ports)),
    ).rejects.toMatchObject({
      code: AUTHORITY_DENIAL_CODES.MISSING_AUTH,
      protocolCode: PROTOCOL_ERROR_CODES.UNAUTHORIZED,
    });
    expect(ports.calls).toEqual([]);
  });

  it("maps policy denials before persistence or model work", async () => {
    const ports = createFakePorts({
      authContext,
      policies: denyRequestPolicy({
        allowed: false,
        check: "rate_limit",
        code: POLICY_DENIAL_CODES.RATE_LIMIT_EXCEEDED,
        protocolCode: PROTOCOL_ERROR_CODES.RATE_LIMITED,
        message: "Rate limit exceeded for this workspace.",
        retryable: true,
      }),
    });

    await expect(collect(runStreamChat(input, ports))).rejects.toMatchObject({
      code: POLICY_DENIAL_CODES.RATE_LIMIT_EXCEEDED,
      protocolCode: PROTOCOL_ERROR_CODES.RATE_LIMITED,
      retryable: true,
    });
    expect(ports.calls).toEqual(["policy"]);
  });

  it("denies cross-tenant access before persistence or model work", async () => {
    const ports = createFakePorts({ authContext });

    await expect(
      collect(
        runStreamChat(
          { ...input, workspace: { tenantId: "tenant_002", workspaceId: "workspace_001" } },
          ports,
        ),
      ),
    ).rejects.toMatchObject({
      code: AUTHORITY_DENIAL_CODES.CROSS_TENANT_WORKSPACE,
      protocolCode: PROTOCOL_ERROR_CODES.FORBIDDEN,
    });
    expect(ports.calls).toEqual([]);
  });

  it("allocates contiguous protocol sequences when runtime lifecycle events are dropped", async () => {
    const ports = createFakePorts({
      authContext,
      runtimeEvents: [
        {
          type: RUNTIME_EVENT_TYPES.STARTED,
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 0,
          providerId: "fake",
          modelId: "fake-echo",
        },
        {
          type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 1,
          content: "Hello",
        },
        {
          type: RUNTIME_EVENT_TYPES.COMPLETED,
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 2,
          finishReason: RUNTIME_FINISH_REASONS.STOP,
        },
      ],
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.DELTA,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2]);
  });

  it("maps runtime failures to a stable terminal protocol error", async () => {
    const ports = createFakePorts({
      authContext,
      runtimeEvents: [
        {
          type: RUNTIME_EVENT_TYPES.ERROR,
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 0,
          code: RUNTIME_ERROR_CODES.TIMEOUT,
          message: "provider timed out",
          retryable: true,
        },
      ],
    });

    const events = await collect(runStreamChat(input, ports));

    expect(events.at(-1)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: PROTOCOL_ERROR_CODES.TIMEOUT,
      retryable: true,
    });
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
  });
});

type FakePortOptions = {
  readonly authContext?: AuthContext;
  readonly runtimeEvents?: readonly RuntimeEvent[];
  readonly policies?: PolicyPort;
};

const createFakePorts = (options: FakePortOptions = {}) => {
  const calls: string[] = [];
  const clock: ClockPort = { now: () => "2026-05-23T13:00:00.000Z" };
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
  const conversations: ConversationRepositoryPort = {
    ensureConversation: ({ authContext: context, fallbackConversationId }) => {
      calls.push("ensureConversation");
      return Effect.succeed({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        conversationId: fallbackConversationId,
      });
    },
    appendUserMessage: () => {
      calls.push("appendUserMessage");
      return Effect.succeed(undefined);
    },
  };
  const runtime: AgentRuntimePort = {
    streamEffect: () => {
      calls.push("runtime");
      return Stream.fromIterable(options.runtimeEvents ?? defaultRuntimeEvents());
    },
  };

  return {
    calls,
    policies: {
      evaluate: (policyInput: PolicyEvaluationInput) => {
        calls.push("policy");
        return (
          options.policies ?? {
            evaluate: () => Effect.succeed({ allowed: true } as const),
          }
        ).evaluate(policyInput);
      },
    },
    conversations,
    runtime,
    clock,
    ids,
  };
};

const runStreamChat = (
  streamInput: StreamChatInput,
  ports: ReturnType<typeof createFakePorts>,
): AsyncIterable<SidechatStreamEvent> =>
  Stream.toAsyncIterable(
    streamChatEffect(streamInput).pipe(
      Stream.provide(
        createPartnerAiCoreLayer({
          conversations: ports.conversations,
          runtime: ports.runtime,
          clock: ports.clock,
          ids: ports.ids,
          policies: ports.policies,
        }),
      ),
    ),
  );

const defaultRuntimeEvents = (): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 0,
    activityId: "activity_001",
    activityKind: "reasoning",
    status: "completed",
    title: "Fake runtime selected deterministic response",
  },
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 1,
    content: "Fake response",
  },
  {
    type: RUNTIME_EVENT_TYPES.COMPLETED,
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 2,
    finishReason: RUNTIME_FINISH_REASONS.STOP,
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  },
];

const collect = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
};

const isTerminalEvent = (event: SidechatStreamEvent): boolean =>
  event.type === SIDECHAT_EVENT_TYPES.COMPLETED || event.type === SIDECHAT_EVENT_TYPES.ERROR;
