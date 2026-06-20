import {
  SIDECHAT_EVENT_TYPES,
  type JsonObject,
  type JsonValue,
  type SidechatStreamEvent,
  type UsageMetadata,
} from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories } from "@side-chat/db";
import { type TurnGuardInput, type TurnGuardRegistryPort } from "@side-chat/partner-ai-core";
import { createPartnerAiServiceApp } from "@side-chat/partner-ai-service";
import { createSideChatApiClient, type FetchLike } from "@side-chat/side-chat-widget";
import {
  applyActivityEvent,
  completeActivityTimeline,
  createWidgetChatRequest,
  createWidgetMessage,
  updateMessage,
  type WidgetMessage,
} from "@side-chat/side-chat-widget/testing";
import { omitUndefinedProperties } from "@side-chat/shared";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

describe("golden-path adopter flow", () => {
  it("streams from manifest policy through context, runtime, client, and widget state", async () => {
    const repositories = createMemorySidechatRepositories({ idPrefix: "adoption" });
    const guardInputs: TurnGuardInput[] = [];
    const app = createPartnerAiServiceApp({
      repositories,
      runtime: { provider: "fake", enableMockWebSearch: true },
      turnGuards: createRecordingGuardRegistry(guardInputs),
      turnGuardIds: ["adoption.prompt_guard"],
    });
    const client = createSideChatApiClient({
      baseUrl: "http://side-chat-adoption.test",
      fetch: withLocalAuth("local-test-token", fetchFromApp(app)),
    });
    const request = createWidgetChatRequest({
      turnProfileId: undefined,
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
    expect(readCandidateSourceTypes(contextSnapshot)).toEqual(
      expect.arrayContaining(["current_message", "host_context", "tool_capability"]),
    );
    expect(readCandidateSourceIds(contextSnapshot)).toContain("mock_web_search");
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
            title: "Thinking (medium)",
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

  return omitUndefinedProperties({
    messages,
    conversationId,
    usage,
  });
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

const asArray = (value: JsonValue | undefined): readonly JsonValue[] =>
  Array.isArray(value) ? value : [];

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
