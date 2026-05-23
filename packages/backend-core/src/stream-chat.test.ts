import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  validateSidechatEventSequence,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import { type AuthContext } from "./authority.js";
import type {
  AssistantRuntimePort,
  ClockPort,
  ConversationRepositoryPort,
  IdGeneratorPort,
  RuntimeEvent,
} from "./ports.js";
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
  authority: { requestId: "request_001", bearerToken: "trusted" },
  providerId: "fake",
  modelId: "fake-echo",
};

describe("stream chat use case", () => {
  it("streams valid sidechat.v1 events through fake ports", async () => {
    const ports = createFakePorts({ authContext });
    const useCase = createStreamChatUseCase(ports);

    const events = await collect(useCase.stream(input));

    expect(events.map((event) => event.type)).toEqual([
      SIDECHAT_EVENT_TYPES.started,
      SIDECHAT_EVENT_TYPES.reasoning,
      SIDECHAT_EVENT_TYPES.delta,
      SIDECHAT_EVENT_TYPES.completed,
    ]);
    expect(validateSidechatEventSequence(events).terminalEvent.type).toBe(
      SIDECHAT_EVENT_TYPES.completed,
    );
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
    expect(ports.calls).toEqual([
      "auth",
      "ensureConversation",
      "appendUserMessage",
      "runtime",
    ]);
  });

  it("requires normalized AuthContext before protected work", async () => {
    const ports = createFakePorts({ authContext: undefined });
    const useCase = createStreamChatUseCase(ports);

    await expect(collect(useCase.stream(input))).rejects.toMatchObject({
      code: "missing_auth",
      protocolCode: "unauthorized",
    });
    expect(ports.calls).toEqual(["auth"]);
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
    expect(ports.calls).toEqual(["auth"]);
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
      type: SIDECHAT_EVENT_TYPES.error,
      code: "timeout",
      retryable: true,
    });
    expect(events.filter(isTerminalEvent)).toHaveLength(1);
  });
});

type FakePortOptions = {
  readonly authContext: AuthContext | undefined;
  readonly runtimeEvents?: readonly RuntimeEvent[];
};

const createFakePorts = (options: FakePortOptions) => {
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
  const runtime: AssistantRuntimePort = {
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
    authority: {
      resolveAuthContext: () => {
        calls.push("auth");
        return Promise.resolve(options.authContext);
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
  event.type === SIDECHAT_EVENT_TYPES.completed ||
  event.type === SIDECHAT_EVENT_TYPES.error;
