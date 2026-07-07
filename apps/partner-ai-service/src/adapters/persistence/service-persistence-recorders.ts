import type {
  ActivityEvent,
  ChatRequestMessage,
  ChatStreamRequest,
  UsageMetadata,
} from "@side-chat/chat-protocol";
import {
  hashCanonicalJson,
  type AuthContext,
  type PreparedTurnContext,
} from "@side-chat/partner-ai-core";
import {
  toActorId,
  type ConversationRecord,
  type MessageRecord,
  type SidechatRepositories,
} from "@side-chat/db";
import { omitUndefinedProperties, toJsonObject, type JsonObject } from "@side-chat/shared";

type PersistableMessage = ChatRequestMessage & {
  readonly role: MessageRecord["role"];
};

export const conversationHistoryCutoffField = (
  conversation: ConversationRecord,
): { readonly historyCutoffSequenceIndex?: number } =>
  omitUndefinedProperties({
    historyCutoffSequenceIndex: conversation.historyCutoffSequenceIndex,
  });

export const conversationTitleTextField = (
  conversation: ConversationRecord,
): { readonly titleText?: string } =>
  omitUndefinedProperties({
    titleText: conversation.titleText,
  });

/**
 * The assistant message's metadata key that stores the turn's activity trace.
 *
 * Write and read live side by side so the shape has exactly one owner: the
 * completion write serializes the protocol activity events verbatim under
 * `turnActivity.events`, and the history route replays them verbatim into
 * `HistoryMessage.activity`. Only present when turn-activity history is
 * enabled AND the turn produced activity; every other message keeps `{}`.
 */
export const turnActivityMetadata = (
  activityEvents: readonly ActivityEvent[] | undefined,
): JsonObject =>
  activityEvents && activityEvents.length > 0
    ? { turnActivity: toJsonObject({ events: activityEvents }) }
    : {};

/** Read back the stored activity trace; `undefined` when none was stored. */
export const readTurnActivityEvents = (
  metadataJson: JsonObject,
): readonly ActivityEvent[] | undefined => {
  const turnActivity = metadataJson["turnActivity"];
  if (!turnActivity || typeof turnActivity !== "object" || Array.isArray(turnActivity)) {
    return undefined;
  }
  const events = (turnActivity as Record<string, unknown>)["events"];
  if (!Array.isArray(events) || events.length === 0) return undefined;
  // This service wrote the events from protocol-typed values; replay verbatim.
  return events as readonly ActivityEvent[];
};

export const recordContextSnapshot = ({
  repositories,
  authContext,
  assistantTurnId,
  preparedContext,
  hostContext,
  manifestHash,
  now,
}: {
  readonly repositories: SidechatRepositories;
  readonly authContext: AuthContext;
  readonly assistantTurnId: string;
  readonly preparedContext: PreparedTurnContext;
  readonly hostContext: ChatStreamRequest["hostContext"];
  readonly manifestHash: string;
  readonly now: string;
}) =>
  repositories.recordTurnContextSnapshot(
    omitUndefinedProperties({
      workspaceId: authContext.workspaceId,
      assistantTurnId,
      contextSchemaVersion: "sidechat.context-manifest.v1",
      hostSurfaceId: hostContext?.origin === "" ? undefined : hostContext?.origin,
      hostContextHash: hashCanonicalJson(hostContext ?? null),
      capabilitiesHash: manifestHash,
      contextRedactedJson: toContextSnapshotJson(preparedContext),
      now,
    }),
  );

export const recordUsage = ({
  repositories,
  authContext,
  assistantTurnId,
  usage,
  providerId,
  modelId,
  now,
}: {
  readonly repositories: SidechatRepositories;
  readonly authContext: AuthContext;
  readonly assistantTurnId: string;
  readonly usage: UsageMetadata | undefined;
  readonly providerId: string;
  readonly modelId: string;
  readonly now: string;
}) => {
  if (!usage) return Promise.resolve();

  return repositories.recordUsage({
    workspaceId: authContext.workspaceId,
    assistantTurnId,
    runtimeStepIndex: 0,
    modelProvider: providerId,
    modelId,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalTokens: usage.totalTokens ?? 0,
    costUnits: "0",
    now,
  });
};

export const appendTurnAuditEvent = ({
  repositories,
  authContext,
  request,
  assistantTurnId,
  providerId,
  modelId,
  finishReason,
  totalTokens,
  now,
}: {
  readonly repositories: SidechatRepositories;
  readonly authContext: AuthContext;
  readonly request: ChatStreamRequest;
  readonly assistantTurnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly finishReason: string;
  readonly totalTokens: number | undefined;
  readonly now: string;
}) =>
  repositories.appendAuditEvent({
    workspaceId: authContext.workspaceId,
    subjectId: authContext.subject.subjectId,
    actorId: toActorId(authContext.actor.subjectId),
    eventType: "sidechat.assistant_turn.completed",
    targetType: "assistant_turn",
    targetId: assistantTurnId,
    metadataJson: {
      modelProvider: providerId,
      modelId,
      finishReason,
      usageTotalTokens: totalTokens ?? null,
    },
    requestId: request.requestId,
    now,
  });

/**
 * Persist a message after a service adapter has assigned its Side Chat role.
 *
 * Browser request messages reach this helper only after `appendUserMessage`
 * supplies `user`; assistant completion messages pass `assistant` from the turn
 * lifecycle. Repository adapters never inspect browser request bodies to choose
 * a role.
 */
export const appendMessage = ({
  repositories,
  authContext,
  conversationId,
  message,
  metadataJson,
  idempotencyKey,
  now,
}: {
  readonly repositories: SidechatRepositories;
  readonly authContext: AuthContext;
  readonly conversationId: string;
  readonly message: PersistableMessage;
  readonly metadataJson?: JsonObject | undefined;
  readonly idempotencyKey: string;
  readonly now: string;
}) =>
  repositories.appendMessage({
    workspaceId: authContext.workspaceId,
    subjectId: authContext.subject.subjectId,
    conversationId,
    role: message.role,
    contentText: message.content,
    metadataJson: metadataJson ?? {},
    idempotencyKey: { value: idempotencyKey },
    now,
  });

const toContextSnapshotJson = (preparedContext: PreparedTurnContext): JsonObject =>
  toJsonObject({
    contextId: preparedContext.contextId,
    runtimeMessageSummary: toRuntimeMessageSummary(preparedContext),
    history: preparedContext.history,
    manifest: preparedContext.contextBoard.manifest,
    sections: preparedContext.contextBoard.sections.map((section) =>
      omitUndefinedProperties({
        title: section.title,
        content: section.content,
        priority: section.priority,
        metadata: section.metadata,
      }),
    ),
    candidates: preparedContext.candidates.map((candidate) =>
      omitUndefinedProperties({
        candidateId: candidate.candidateId,
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        trustLevel: candidate.trustLevel,
        redactionClass: candidate.redactionClass,
        estimatedTokens: candidate.estimatedTokens,
        priority: candidate.priority,
        provenance: candidate.provenance,
        metadata: candidate.metadata,
      }),
    ),
  });

/**
 * Persist only a content-free index of runtime chat messages.
 *
 * The runtime receives full role/content pairs, but context snapshots should
 * only keep enough metadata to audit message count, roles, and which history
 * messages were admitted. Prior conversation text stays out of this persisted
 * JSON so history is not duplicated in another storage path.
 */
const toRuntimeMessageSummary = (preparedContext: PreparedTurnContext): JsonObject =>
  toJsonObject({
    messageCount: preparedContext.runtimeMessages.length,
    roles: preparedContext.runtimeMessages.map((message) => message.role),
    admittedHistoryMessageIds: preparedContext.history.messages
      .filter((message) => message.included)
      .map((message) => message.messageId),
  });
