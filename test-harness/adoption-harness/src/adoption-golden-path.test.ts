import { createChatClient, type FetchLike } from "@side-chat/chat-client";
import {
  SIDECHAT_EVENT_TYPES,
  type JsonObject,
  type JsonValue,
  type SidechatStreamEvent,
  type UsageMetadata,
} from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories } from "@side-chat/db";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  type MemoryPort,
  type MemoryRecallInput,
  type MemoryWriteCandidateProposalInput,
  type MemoryWriteCandidateRecordInput,
  type RagRetrievalInput,
  type RagRetrieverPort,
  type ResearchAgentInput,
  RESEARCH_CONTEXT_AGENT_ID,
  type ResearchAgentCapability,
  type ResearchAgentPort,
  type RetrievalSourceCapability,
  type TurnGuardInput,
  type TurnGuardRegistryPort,
} from "@side-chat/partner-ai-core";
import { createPartnerAiServiceApp } from "@side-chat/partner-ai-service";
import {
  applyActivityEvent,
  completeActivityTimeline,
  createWidgetChatRequest,
  createWidgetMessage,
  updateMessage,
  type WidgetMessage,
} from "@side-chat/side-chat-widget/testing";
import { optionalField } from "@side-chat/shared";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

describe("golden-path adopter flow", () => {
  it("streams from manifest policy through context, runtime, client, and widget state", async () => {
    const repositories = createMemorySidechatRepositories({ idPrefix: "adoption" });
    const guardInputs: TurnGuardInput[] = [];
    const ragInputs: RagRetrievalInput[] = [];
    const researchInputs: ResearchAgentInput[] = [];
    const memoryRecallInputs: MemoryRecallInput[] = [];
    const memoryProposalInputs: MemoryWriteCandidateProposalInput[] = [];
    const memoryWriteInputs: MemoryWriteCandidateRecordInput[] = [];
    const app = createPartnerAiServiceApp({
      repositories,
      runtime: { provider: "fake", enableMockWebSearch: true },
      turnGuards: createRecordingGuardRegistry(guardInputs),
      turnGuardIds: ["adoption.prompt_guard"],
      retrievalSources: [docsSource],
      ragRetriever: createRecordingRagRetriever(ragInputs),
      memoryPolicy: { policyId: "user_memory", mode: "read_write", scopes: ["user"] },
      memory: createRecordingMemory(memoryRecallInputs, memoryProposalInputs, memoryWriteInputs),
      researchAgents: [researchAgentCapability],
      researchAgent: createRecordingResearchAgent(researchInputs),
    });
    const client = createChatClient({
      baseUrl: "http://side-chat-adoption.test",
      fetch: withLocalAuth("local-test-token", fetchFromApp(app)),
    });
    const request = createWidgetChatRequest({
      assistantProfileId: undefined,
      conversationId: undefined,
      hostContext: {
        schemaVersion: "adoption-harness.host-context.v1",
        origin: "https://host.example",
        title: "Adoption dashboard",
      },
      message: "Summarize adoption context",
      messageId: "message_adoption_001",
      requestId: "request_adoption_001",
    });

    const events = await collectEvents((await client.streamChat(request)).events);
    const widgetState = projectEventsIntoWidgetState(
      request.message.id,
      request.message.content,
      events,
    );
    const snapshot = repositories.snapshot();
    const contextSnapshot = snapshot.contextSnapshots[0]?.contextRedactedJson;

    expect(events[0]).toMatchObject({ type: SIDECHAT_EVENT_TYPES.STARTED });
    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
    expect(events.some((event) => event.type === SIDECHAT_EVENT_TYPES.ACTIVITY)).toBe(true);
    expect(events.some((event) => event.type === SIDECHAT_EVENT_TYPES.DELTA)).toBe(true);
    expect(guardInputs).toHaveLength(1);
    expect(guardInputs[0]).toMatchObject({
      requestId: "request_adoption_001",
      userMessage: "Summarize adoption context",
      profileId: "default",
      safetyPolicyId: "standard",
    });
    expect(guardInputs[0]).not.toHaveProperty("contextBoard");
    expect(guardInputs[0]).not.toHaveProperty("allowedToolNames");
    expect(ragInputs[0]).toMatchObject({ allowedSourceIds: ["docs"] });
    expect(researchInputs[0]).toMatchObject({
      allowedSourceIds: ["docs"],
      requestId: "request_adoption_001",
    });
    expect(memoryRecallInputs[0]).toMatchObject({ allowedScopes: ["user"] });
    expect(memoryProposalInputs[0]).toMatchObject({
      userMessage: "Summarize adoption context",
      assistantContent: "Fake response: Summarize adoption context",
      allowedScopes: ["user"],
    });
    expect(memoryWriteInputs[0]?.candidates).toEqual([
      expect.objectContaining({ candidateId: "memory_write_adoption_001", scope: "user" }),
    ]);
    expect(readCandidateSourceTypes(contextSnapshot)).toEqual(
      expect.arrayContaining([
        "current_message",
        "host_context",
        "memory",
        "retrieval_result",
        "research_artifact",
        "research_result",
        "tool_capability",
      ]),
    );
    expect(readCandidateSourceIds(contextSnapshot)).toContain("mock_web_search");
    expect(readResearchArtifactKinds(contextSnapshot)).toEqual(["research_summary"]);
    expect(snapshot.assistantTurns[0]).toMatchObject({
      requestId: "request_adoption_001",
      status: "completed",
      finishReason: "stop",
    });
    expect(snapshot.messages.map((message) => [message.role, message.contentText])).toEqual([
      ["user", "Summarize adoption context"],
      ["assistant", "Fake response: Summarize adoption context"],
    ]);
    expect(widgetState.conversationId).toBeTruthy();
    expect(widgetState.usage?.totalTokens).toBeGreaterThan(0);
    expect(widgetState.messages[1]).toMatchObject({
      role: "assistant",
      content: "Fake response: Summarize adoption context",
      activity: {
        items: [
          expect.objectContaining({
            kind: "reasoning",
            status: "completed",
            title: "Selected deterministic echo script",
          }),
        ],
      },
      isStreaming: false,
    });
  });
});

type WidgetProjectedState = {
  readonly conversationId?: string;
  readonly messages: readonly WidgetMessage[];
  readonly usage?: UsageMetadata;
};

const fetchFromApp =
  (app: ReturnType<typeof createPartnerAiServiceApp>): FetchLike =>
  (input, init = {}) => {
    const url = input instanceof Request ? input.url : input.toString();
    const path = `${new URL(url).pathname}${new URL(url).search}`;
    return Promise.resolve(app.request(path, input instanceof Request ? input : init));
  };

const withLocalAuth =
  (authToken: string, fetchLike: FetchLike): FetchLike =>
  (input, init = {}) =>
    fetchLike(input, {
      ...init,
      headers: {
        ...readHeaders(init.headers),
        authorization: `Bearer ${authToken}`,
      },
    });

const readHeaders = (headers: HeadersInit | undefined): Record<string, string> => {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
};

const collectEvents = async (
  events: AsyncIterable<SidechatStreamEvent>,
): Promise<readonly SidechatStreamEvent[]> => {
  const collected: SidechatStreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
};

const projectEventsIntoWidgetState = (
  userMessageId: string,
  userContent: string,
  events: readonly SidechatStreamEvent[],
): WidgetProjectedState => {
  const assistantMessageId = "assistant_adoption_001";
  let conversationId: string | undefined;
  let usage: UsageMetadata | undefined;
  let messages: readonly WidgetMessage[] = [
    createWidgetMessage(userMessageId, "user", userContent),
    createWidgetMessage(assistantMessageId, "assistant", "", true),
  ];

  for (const event of events) {
    if (event.type === SIDECHAT_EVENT_TYPES.STARTED) {
      conversationId = event.conversationId;
      continue;
    }
    if (event.type === SIDECHAT_EVENT_TYPES.ACTIVITY) {
      messages = updateMessage(messages, assistantMessageId, (message: WidgetMessage) => ({
        ...message,
        activity: applyActivityEvent(message.activity, event),
      }));
      continue;
    }
    if (event.type === SIDECHAT_EVENT_TYPES.DELTA) {
      messages = updateMessage(messages, assistantMessageId, (message: WidgetMessage) => ({
        ...message,
        content: `${message.content}${event.content}`,
      }));
      continue;
    }
    if (event.type === SIDECHAT_EVENT_TYPES.COMPLETED) {
      usage = event.usage;
      messages = updateMessage(messages, assistantMessageId, (message: WidgetMessage) => ({
        ...message,
        activity: completeActivityTimeline(message.activity, event.createdAt),
        isStreaming: false,
      }));
    }
  }

  return {
    messages,
    ...optionalField("conversationId", conversationId),
    ...optionalField("usage", usage),
  };
};

const createRecordingGuardRegistry = (calls: TurnGuardInput[]): TurnGuardRegistryPort => ({
  guards: [
    {
      guardId: "adoption.prompt_guard",
      description: "Records that adopter guard policy ran.",
      check: (input) =>
        Effect.sync(() => {
          calls.push(input);
          return { kind: "allow" } as const;
        }),
    },
  ],
});

const createRecordingRagRetriever = (calls: RagRetrievalInput[]): RagRetrieverPort => ({
  retrieve: (input) =>
    Effect.sync(() => {
      calls.push(input);
      return [
        {
          candidateId: "rag_docs_adoption_001",
          sourceId: "docs",
          title: "Adoption docs",
          content: "Adoption docs explain the customer workspace.",
          url: "https://docs.example/adoption",
          score: 0.91,
          estimatedTokens: 12,
          trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
          redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
        },
      ];
    }),
});

const createRecordingResearchAgent = (calls: ResearchAgentInput[]): ResearchAgentPort => ({
  runResearch: (input) =>
    Effect.sync(() => {
      calls.push(input);
      return {
        summary: "Research summary combines adoption docs and memory.",
        artifactId: "artifact_adoption_research_001",
        sources: [
          {
            candidateId: "research_docs_adoption_001",
            sourceId: "docs",
            title: "Research source",
            content: "Research source cites the adoption docs.",
            score: 0.86,
            estimatedTokens: 10,
            trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
            redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
          },
        ],
      };
    }),
});

const createRecordingMemory = (
  recallCalls: MemoryRecallInput[],
  proposalCalls: MemoryWriteCandidateProposalInput[],
  writeCalls: MemoryWriteCandidateRecordInput[],
): MemoryPort => ({
  recall: (input) =>
    Effect.sync(() => {
      recallCalls.push(input);
      return [
        {
          memoryId: "memory_adoption_001",
          scope: "user",
          content: "Prefers concise architecture summaries.",
          confidence: 0.94,
          updatedAt: "2026-06-13T12:00:00.000Z",
        },
      ];
    }),
  proposeWriteCandidates: (input) =>
    Effect.sync(() => {
      proposalCalls.push(input);
      return [
        {
          candidateId: "memory_write_adoption_001",
          scope: "user",
          content: "Asked for the adoption golden path.",
          reason: "User-specific follow-up preference.",
          confidence: 0.82,
          sourceTurnId: input.assistantTurnId,
        },
      ];
    }),
  writeCandidates: (input) =>
    Effect.sync(() => {
      writeCalls.push(input);
    }),
});

const readCandidateSourceTypes = (snapshot: JsonObject | undefined): readonly string[] => {
  const candidates = asArray(snapshot?.["candidates"]);
  return candidates
    .map((candidate) => (isJsonObject(candidate) ? candidate["sourceType"] : undefined))
    .filter((sourceType): sourceType is string => typeof sourceType === "string");
};

const readCandidateSourceIds = (snapshot: JsonObject | undefined): readonly string[] => {
  const candidates = asArray(snapshot?.["candidates"]);
  return candidates
    .map((candidate) => (isJsonObject(candidate) ? candidate["sourceId"] : undefined))
    .filter((sourceId): sourceId is string => typeof sourceId === "string");
};

const readResearchArtifactKinds = (snapshot: JsonObject | undefined): readonly string[] => {
  const artifacts = asArray(snapshot?.["researchArtifacts"]);
  return artifacts
    .map((artifact) => (isJsonObject(artifact) ? artifact["artifactKind"] : undefined))
    .filter((artifactKind): artifactKind is string => typeof artifactKind === "string");
};

const asArray = (value: JsonValue | undefined): readonly JsonValue[] =>
  Array.isArray(value) ? value : [];

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const docsSource: RetrievalSourceCapability = {
  sourceId: "docs",
  description: "Workspace documentation.",
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
};

const researchAgentCapability: ResearchAgentCapability = {
  researchAgentId: RESEARCH_CONTEXT_AGENT_ID,
  description: "Run pre-answer research.",
};
