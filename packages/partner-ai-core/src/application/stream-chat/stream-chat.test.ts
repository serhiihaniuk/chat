import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  validateSidechatEventSequence,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import { type AuthContext } from "#domain/authority";
import type {
  AgentRuntimePort,
  ClockPort,
  ConversationRepositoryPort,
  IdGeneratorPort,
  RuntimeEvent,
} from "#ports";
import {
  denyRequestPolicy,
  POLICY_DENIAL_CODES,
  type PolicyEvaluationInput,
  type PolicyPort,
} from "#policies/policy";
import {
  createStreamChatUseCase,
  type StreamChatInput,
} from "./stream-chat.js";

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
  it("streams valid sidechat.v1 events through fake ports", async () => {
    const ports = createFakePorts({ authContext });
    const useCase = createStreamChatUseCase(ports);

    const events = await collect(useCase.stream(input));

    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.STARTED,
      SIDECHAT_EVENT_TYPES.REASONING,
      SIDECHAT_EVENT_TYPES.DELTA,
      SIDECHAT_EVENT_TYPES.COMPLETED,
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(validateSidechatEventSequence(events).terminalEvent.type).toBe(
      SIDECHAT_EVENT_TYPES.COMPLETED,
    );
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
    expect(ports.calls).toEqual([
      "policy",
      "ensureConversation",
      "appendUserMessage",
      "runtime",
    ]);
  });

  it("requires normalized AuthContext before protected work", async () => {
    const ports = createFakePorts();
    const useCase = createStreamChatUseCase(ports);

    await expect(
      collect(
        useCase.stream({
          ...input,
          authContext: undefined,
        }),
      ),
    ).rejects.toMatchObject({
      code: "missing_auth",
      protocolCode: "unauthorized",
    });
    expect(ports.calls).toEqual([]);
  });

  it("maps policy denials before persistence or model work", async () => {
    const ports = createFakePorts({
      authContext,
      policies: denyRequestPolicy({
        allowed: false,
        check: "rate_limit",
        code: POLICY_DENIAL_CODES.rateLimitExceeded,
        protocolCode: "rate_limited",
        message: "Rate limit exceeded for this workspace.",
        retryable: true,
      }),
    });
    const useCase = createStreamChatUseCase(ports);

    await expect(collect(useCase.stream(input))).rejects.toMatchObject({
      code: "rate_limit_exceeded",
      protocolCode: "rate_limited",
      retryable: true,
    });
    expect(ports.calls).toEqual(["policy"]);
  });

  it("denies cross-tenant access before persistence or model work", async () => {
    const ports = createFakePorts({ authContext });
    const useCase = createStreamChatUseCase(ports);

    await expect(
      collect(
        useCase.stream({
          ...input,
          workspace: { tenantId: "tenant_002", workspaceId: "workspace_001" },
        }),
      ),
    ).rejects.toMatchObject({
      code: "cross_tenant_workspace",
      protocolCode: "forbidden",
    });
    expect(ports.calls).toEqual([]);
  });

  it("allocates contiguous protocol sequences when runtime lifecycle events are dropped", async () => {
    const ports = createFakePorts({
      authContext,
      runtimeEvents: [
        {
          type: "runtime.started",
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 0,
          providerId: "fake",
          modelId: "fake-echo",
        },
        {
          type: "runtime.output_delta",
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 1,
          content: "Hello",
        },
        {
          type: "runtime.completed",
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 2,
          finishReason: "stop",
        },
      ],
    });
    const useCase = createStreamChatUseCase(ports);

    const events = await collect(useCase.stream(input));

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
          type: "runtime.error",
          requestId: "request_001",
          assistantTurnId: "assistant_turn_001",
          sequence: 0,
          code: "timeout",
          message: "provider timed out",
          retryable: true,
        },
      ],
    });
    const useCase = createStreamChatUseCase(ports);

    const events = await collect(useCase.stream(input));

    expect(events.at(-1)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.ERROR,
      code: "timeout",
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
      return Promise.resolve({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        conversationId: fallbackConversationId,
      });
    },
    appendUserMessage: () => {
      calls.push("appendUserMessage");
      return Promise.resolve();
    },
  };
  const runtime: AgentRuntimePort = {
    stream: async function* () {
      calls.push("runtime");
      await Promise.resolve();
      for (const event of options.runtimeEvents ?? defaultRuntimeEvents()) {
        yield event;
      }
    },
  };

  return {
    calls,
    policies: {
      evaluate: (policyInput: PolicyEvaluationInput) => {
        calls.push("policy");
        return (
          options.policies ?? {
            evaluate: () => Promise.resolve({ allowed: true } as const),
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

const defaultRuntimeEvents = (): readonly RuntimeEvent[] => [
  {
    type: "runtime.reasoning",
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 0,
    summary: "fake runtime selected deterministic response",
  },
  {
    type: "runtime.output_delta",
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 1,
    content: "Fake response",
  },
  {
    type: "runtime.completed",
    requestId: "request_001",
    assistantTurnId: "assistant_turn_001",
    sequence: 2,
    finishReason: "stop",
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  },
];

const collect = async <T>(items: AsyncIterable<T>): Promise<T[]> => {
  const collected: T[] = [];
  for await (const item of items) collected.push(item);
  return collected;
};

const isTerminalEvent = (event: SidechatStreamEvent): boolean =>
  event.type === SIDECHAT_EVENT_TYPES.COMPLETED ||
  event.type === SIDECHAT_EVENT_TYPES.ERROR;
