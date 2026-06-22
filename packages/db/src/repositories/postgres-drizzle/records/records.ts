import { and, eq, gt, lt, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { omitNullishField } from "@side-chat/shared";

import {
  assistantTurns,
  conversations,
  messages,
  type auditEvents,
  type hostCommandResults,
  type sidechatTables,
  type toolInvocations,
  type turnContextSnapshots,
  type turnEvents,
  type usageRecords,
} from "#drizzle/schema";
import type {
  AssistantTurnRecord,
  AuditEventRecord,
  ContextSnapshotRecord,
  ConversationRecord,
  HostCommandResultRecord,
  MessageRecord,
  ToolInvocationRecord,
  TurnEventRecord,
  TurnEventType,
  UsageRecord,
} from "#schema-contract";
import { DbRepositoryError } from "../../errors.js";
import { isoTimestamp, one, optionalIsoTimestamp } from "../../repository-utils.js";

export const toConversationRecord = (
  row: typeof conversations.$inferSelect,
): ConversationRecord => ({
  conversationId: row.conversationId,
  workspaceId: row.workspaceId,
  subjectId: row.subjectId,
  conversationKey: row.conversationKey,
  status: row.status as ConversationRecord["status"],
  ...omitNullishField("titleText", row.titleText),
  createdByActorId: row.createdByActorId,
  ...omitNullishField("historyCutoffSequenceIndex", row.historyCutoffSequenceIndex),
  createdAt: isoTimestamp(row.createdAt),
  updatedAt: isoTimestamp(row.updatedAt),
  lastMessageAt: isoTimestamp(row.lastMessageAt),
});

export const toMessageRecord = (row: typeof messages.$inferSelect): MessageRecord => ({
  messageId: row.messageId,
  conversationId: row.conversationId,
  workspaceId: row.workspaceId,
  role: row.role as MessageRecord["role"],
  contentText: row.contentText,
  metadataJson: row.metadataJson,
  sequenceIndex: row.sequenceIndex,
  ...omitNullishField("idempotencyKey", row.idempotencyKey),
  createdAt: isoTimestamp(row.createdAt),
  updatedAt: isoTimestamp(row.createdAt),
});

export const toAssistantTurnRecord = (
  row: typeof assistantTurns.$inferSelect,
): AssistantTurnRecord => ({
  assistantTurnId: row.assistantTurnId,
  requestId: row.requestId,
  conversationId: row.conversationId,
  workspaceId: row.workspaceId,
  subjectId: row.subjectId,
  actorId: row.actorId,
  userMessageId: row.userMessageId,
  ...omitNullishField("assistantMessageId", row.assistantMessageId),
  runtimeProfile: row.runtimeProfile,
  systemPromptVersion: row.systemPromptVersion,
  contextStrategyVersion: row.contextStrategyVersion,
  toolRegistryVersion: row.toolRegistryVersion,
  modelProvider: row.modelProvider,
  modelId: row.modelId,
  status: row.status as AssistantTurnRecord["status"],
  ...omitNullishField("finishReason", row.finishReason),
  ...omitNullishField("errorCode", row.errorCode),
  startedAt: isoTimestamp(row.startedAt),
  ...omitNullishField("completedAt", optionalIsoTimestamp(row.completedAt)),
  ...omitNullishField("cancelRequestedAt", optionalIsoTimestamp(row.cancelRequestedAt)),
  ...omitNullishField("ownerInstanceId", row.ownerInstanceId),
  ...omitNullishField("leaseExpiresAt", optionalIsoTimestamp(row.leaseExpiresAt)),
  leaseEpoch: row.leaseEpoch,
  createdAt: isoTimestamp(row.startedAt),
  updatedAt: isoTimestamp(row.completedAt ?? row.startedAt),
});

export const toTurnEventRecord = (row: typeof turnEvents.$inferSelect): TurnEventRecord => ({
  assistantTurnId: row.assistantTurnId,
  sequence: row.sequence,
  type: row.type as TurnEventType,
  payloadJson: row.payloadJson,
  createdAt: isoTimestamp(row.createdAt),
});

export const toContextSnapshotRecord = (
  row: typeof turnContextSnapshots.$inferSelect,
): ContextSnapshotRecord => ({
  contextSnapshotId: row.contextSnapshotId,
  assistantTurnId: row.assistantTurnId,
  workspaceId: row.workspaceId,
  contextSchemaVersion: row.contextSchemaVersion,
  ...omitNullishField("hostSurfaceId", row.hostSurfaceId),
  hostContextHash: row.hostContextHash,
  capabilitiesHash: row.capabilitiesHash,
  contextRedactedJson: row.contextRedactedJson,
  createdAt: isoTimestamp(row.createdAt),
  updatedAt: isoTimestamp(row.createdAt),
});

export const toUsageRecord = (row: typeof usageRecords.$inferSelect): UsageRecord => ({
  usageRecordId: row.usageRecordId,
  assistantTurnId: row.assistantTurnId,
  workspaceId: row.workspaceId,
  runtimeStepIndex: row.runtimeStepIndex,
  modelProvider: row.modelProvider,
  modelId: row.modelId,
  ...omitNullishField("providerRequestId", row.providerRequestId),
  inputTokens: row.inputTokens,
  outputTokens: row.outputTokens,
  reasoningTokens: row.reasoningTokens,
  cachedInputTokens: row.cachedInputTokens,
  totalTokens: row.totalTokens,
  costUnits: row.costUnits,
  createdAt: isoTimestamp(row.createdAt),
  updatedAt: isoTimestamp(row.createdAt),
});

export const toToolInvocationRecord = (
  row: typeof toolInvocations.$inferSelect,
): ToolInvocationRecord => ({
  toolInvocationId: row.toolInvocationId,
  assistantTurnId: row.assistantTurnId,
  workspaceId: row.workspaceId,
  runtimeStepIndex: row.runtimeStepIndex,
  toolCallId: row.toolCallId,
  toolName: row.toolName,
  status: row.status as ToolInvocationRecord["status"],
  inputHash: row.inputHash,
  ...omitNullishField("outputHash", row.outputHash),
  inputRedactedJson: row.inputRedactedJson,
  ...omitNullishField("outputRedactedJson", row.outputRedactedJson),
  ...omitNullishField("errorCode", row.errorCode),
  startedAt: isoTimestamp(row.startedAt),
  ...omitNullishField("completedAt", optionalIsoTimestamp(row.completedAt)),
  createdAt: isoTimestamp(row.startedAt),
  updatedAt: isoTimestamp(row.completedAt ?? row.startedAt),
});

export const toHostCommandResultRecord = (
  row: typeof hostCommandResults.$inferSelect,
): HostCommandResultRecord => ({
  hostCommandId: row.hostCommandId,
  assistantTurnId: row.assistantTurnId,
  workspaceId: row.workspaceId,
  commandId: row.commandId,
  commandType: row.commandType,
  ...omitNullishField("resourceId", row.resourceId),
  status: row.status as HostCommandResultRecord["status"],
  resultCode: row.resultCode,
  commandRedactedJson: row.commandRedactedJson,
  ...omitNullishField("resultRedactedJson", row.resultRedactedJson),
  createdAt: isoTimestamp(row.createdAt),
  updatedAt: isoTimestamp(row.resolvedAt ?? row.createdAt),
  ...omitNullishField("resolvedAt", optionalIsoTimestamp(row.resolvedAt)),
});

export const toAuditEventRecord = (row: typeof auditEvents.$inferSelect): AuditEventRecord => ({
  auditEventId: row.auditEventId,
  workspaceId: row.workspaceId,
  subjectId: row.subjectId,
  actorId: row.actorId,
  eventType: row.eventType,
  targetType: row.targetType,
  targetId: row.targetId,
  metadataJson: row.metadataJson,
  requestId: row.requestId,
  createdAt: isoTimestamp(row.createdAt),
  updatedAt: isoTimestamp(row.createdAt),
});

const requireConversation = async (
  db: NodePgDatabase<typeof sidechatTables>,
  workspaceId: string,
  conversationId: string,
): Promise<ConversationRecord> =>
  toConversationRecord(
    one(
      await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.workspaceId, workspaceId),
            eq(conversations.conversationId, conversationId),
          ),
        )
        .limit(1),
      "record_not_found",
      "Conversation does not exist in the requested workspace.",
    ),
  );

export const requireSubjectConversation = async (
  db: NodePgDatabase<typeof sidechatTables>,
  workspaceId: string,
  subjectId: string,
  conversationId: string,
): Promise<ConversationRecord> => {
  const conversation = await requireConversation(db, workspaceId, conversationId);
  if (conversation.subjectId !== subjectId) {
    throw new DbRepositoryError(
      "cross_tenant_access_denied",
      "Conversation belongs to a different subject.",
    );
  }
  return conversation;
};

/**
 * Prove a turn belongs to the workspace before its event log is touched.
 *
 * `turn_events` rows are not workspace-stamped, so the only tenant boundary for
 * the log is this lookup. Append/read/max all gate on it so a guessed turn id
 * from another workspace fails closed.
 */
export const requireWorkspaceTurn = async (
  db: NodePgDatabase<typeof sidechatTables>,
  workspaceId: string,
  assistantTurnId: string,
): Promise<typeof assistantTurns.$inferSelect> =>
  one(
    await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, workspaceId),
          eq(assistantTurns.assistantTurnId, assistantTurnId),
        ),
      )
      .limit(1),
    "record_not_found",
    "Assistant turn does not exist in the requested workspace.",
  );

export const requireRunningTurn = async (
  db: NodePgDatabase<typeof sidechatTables>,
  workspaceId: string,
  assistantTurnId: string,
): Promise<typeof assistantTurns.$inferSelect> => {
  const turn = one(
    await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, workspaceId),
          eq(assistantTurns.assistantTurnId, assistantTurnId),
        ),
      )
      .limit(1),
    "record_not_found",
    "Assistant turn does not exist in the requested workspace.",
  );
  if (turn.status !== "running") {
    throw new DbRepositoryError(
      "invalid_transition",
      "Only running assistant turns can be completed or failed.",
    );
  }
  return turn;
};

export const buildHistoryWhere = (
  workspaceId: string,
  conversationId: string,
  afterSequenceIndex: number | undefined,
  beforeSequenceIndex: number | undefined,
): SQL => {
  const clauses = [
    eq(messages.workspaceId, workspaceId),
    eq(messages.conversationId, conversationId),
  ];
  if (afterSequenceIndex !== undefined) {
    clauses.push(gt(messages.sequenceIndex, afterSequenceIndex));
  }
  if (beforeSequenceIndex !== undefined) {
    clauses.push(lt(messages.sequenceIndex, beforeSequenceIndex));
  }

  return and(...clauses)!;
};
