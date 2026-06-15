import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import {
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveAssistantProfileFromManifest,
  type ConversationHistoryContextPort,
  type PreparedHistoryMessage,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createServiceHostCapabilityManifest } from "../manifest/service-capability-manifest.js";
import { createServiceContextManager } from "./service-context-manager.js";

const authContext = {
  tenantId: "tenant_local",
  workspaceId: "workspace_local",
  subject: { subjectId: "subject_1", userId: "user_1" },
  actor: { subjectId: "subject_1", userId: "user_1" },
  roles: ["member"],
  scopes: ["conversation:read", "conversation:write", "message:write"],
  source: "test_authority",
  issuedAt: "2026-05-23T13:00:00.000Z",
} as const;

const request = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_context_history_001",
  message: { id: "message_context_history_001", role: "user", content: "find docs" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    title: "Product dashboard",
  },
} as const;

describe("service context manager conversation history", () => {
  it("renders admitted prior messages before the current user message", async () => {
    const historyInputs: Parameters<
      ConversationHistoryContextPort["readConversationHistory"]
    >[0][] = [];
    const preparedContext = await prepareHistoryContext({
      calls: historyInputs,
      messages: [
        createHistoryMessage("message_history_001", 0, "user", "My project codename is Blue Lynx."),
        createHistoryMessage("message_history_002", 1, "assistant", "I will remember Blue Lynx."),
      ],
    });

    expect(historyInputs[0]).toMatchObject({
      conversation: { conversationId: "conversation_context_001" },
      currentUserMessage: { messageId: "message_record_context_001", sequenceIndex: 2 },
      limit: 7,
    });
    expect(preparedContext.runtimeMessages).toEqual([
      { role: "user", content: "My project codename is Blue Lynx." },
      { role: "assistant", content: "I will remember Blue Lynx." },
      { role: "user", content: "find docs" },
    ]);
    expect(preparedContext.contextBoard.manifest.history).toMatchObject({
      policyMode: "recent_messages",
      consideredMessageCount: 2,
      admittedMessageCount: 2,
      droppedMessageCount: 0,
      estimatedTokens: 16,
    });
    expect(JSON.stringify(preparedContext.contextBoard.manifest.history)).not.toContain(
      "Blue Lynx",
    );
  });

  it("drops oldest history messages beyond the configured message window", async () => {
    const preparedContext = await prepareHistoryContext({
      messages: [
        createHistoryMessage("message_history_001", 0, "user", "one"),
        createHistoryMessage("message_history_002", 1, "assistant", "two"),
        createHistoryMessage("message_history_003", 2, "user", "three"),
      ],
      maxMessages: 2,
    });

    expect(preparedContext.runtimeMessages).toEqual([
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
      { role: "user", content: "find docs" },
    ]);
    expect(preparedContext.history.messages).toContainEqual(
      expect.objectContaining({
        messageId: "message_history_001",
        included: false,
        dropReason: "message_limit",
      }),
    );
  });

  it("drops oldest admitted history messages beyond the configured token budget", async () => {
    const preparedContext = await prepareHistoryContext({
      messages: [
        createHistoryMessage("message_history_001", 0, "user", "too many tokens", 10),
        createHistoryMessage("message_history_002", 1, "assistant", "small", 2),
        createHistoryMessage("message_history_003", 2, "user", "fits", 2),
      ],
      maxTokens: 4,
    });

    expect(preparedContext.runtimeMessages).toEqual([
      { role: "assistant", content: "small" },
      { role: "user", content: "fits" },
      { role: "user", content: "find docs" },
    ]);
    expect(preparedContext.history.messages).toContainEqual(
      expect.objectContaining({
        messageId: "message_history_001",
        included: false,
        dropReason: "token_limit",
      }),
    );
  });

  it("does not read history when the history policy is disabled", async () => {
    const historyInputs: Parameters<
      ConversationHistoryContextPort["readConversationHistory"]
    >[0][] = [];
    const preparedContext = await prepareHistoryContext({
      calls: historyInputs,
      mode: "disabled",
      messages: [createHistoryMessage("message_history_001", 0, "user", "hidden")],
    });

    expect(historyInputs).toEqual([]);
    expect(preparedContext.runtimeMessages).toEqual([{ role: "user", content: "find docs" }]);
    expect(preparedContext.history).toMatchObject({
      policyMode: "disabled",
      admittedMessageCount: 0,
    });
  });

  it("does not read history for unsupported summary mode", async () => {
    const historyInputs: Parameters<
      ConversationHistoryContextPort["readConversationHistory"]
    >[0][] = [];
    const preparedContext = await prepareHistoryContext({
      calls: historyInputs,
      mode: "recent_plus_summary",
      messages: [createHistoryMessage("message_history_001", 0, "user", "hidden")],
    });

    expect(historyInputs).toEqual([]);
    expect(preparedContext.runtimeMessages).toEqual([{ role: "user", content: "find docs" }]);
    expect(preparedContext.history).toMatchObject({
      policyMode: "recent_plus_summary",
      admittedMessageCount: 0,
    });
  });

  it("guards against a history adapter returning the current user message", async () => {
    const preparedContext = await prepareHistoryContext({
      messages: [createHistoryMessage("message_record_context_001", 2, "user", "find docs")],
    });

    expect(preparedContext.runtimeMessages).toEqual([{ role: "user", content: "find docs" }]);
    expect(preparedContext.history.admittedMessageCount).toBe(0);
  });
});

const prepareHistoryContext = ({
  calls = [],
  mode = "recent_messages",
  messages,
  maxMessages = 6,
  maxTokens = 100,
}: {
  readonly calls?: Parameters<ConversationHistoryContextPort["readConversationHistory"]>[0][];
  readonly mode?: "disabled" | "recent_messages" | "recent_plus_summary";
  readonly messages: readonly PreparedHistoryMessage[];
  readonly maxMessages?: number;
  readonly maxTokens?: number;
}) =>
  Effect.runPromise(
    createServiceContextManager({
      historyContext: createHistoryContext(calls, messages),
      history: { mode, maxMessages, maxTokens },
    }).prepareTurnContext(createContextInput()),
  );

const createContextInput = () => {
  const manifest = createServiceHostCapabilityManifest({
    runtimeConfig: {},
    providerId: "fake",
    modelId: "fake-echo",
  });
  const profileResolution = resolveAssistantProfileFromManifest(manifest);
  if (!profileResolution.resolved) throw new Error(profileResolution.issue.message);

  return {
    authContext,
    workspace: { tenantId: "tenant_local", workspaceId: "workspace_local" },
    conversation: {
      tenantId: "tenant_local",
      workspaceId: "workspace_local",
      conversationId: "conversation_context_001",
    },
    currentUserMessage: {
      tenantId: "tenant_local",
      workspaceId: "workspace_local",
      conversationId: "conversation_context_001",
      messageId: "message_record_context_001",
      sequenceIndex: 2,
    },
    request,
    manifest,
    policyDecision: createTurnPolicyDecision({
      manifest,
      profile: profileResolution.profile,
      manifestHash: hashHostCapabilityManifest(manifest),
    }),
    now: "2026-05-23T13:00:00.000Z",
  };
};

const createHistoryContext = (
  calls: Parameters<ConversationHistoryContextPort["readConversationHistory"]>[0][],
  messages: readonly PreparedHistoryMessage[],
): ConversationHistoryContextPort => ({
  readConversationHistory: (input) =>
    Effect.sync(() => {
      calls.push(input);
      return messages;
    }),
});

const createHistoryMessage = (
  messageId: string,
  sequenceIndex: number,
  role: PreparedHistoryMessage["role"],
  content: string,
  estimatedTokens = Math.max(1, Math.ceil(content.length / 4)),
): PreparedHistoryMessage => ({
  messageId,
  sequenceIndex,
  role,
  content,
  estimatedTokens,
});
