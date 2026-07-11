import { and, eq, gt, lt, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { omitNullishField } from "@side-chat/shared";

import {
  conversations,
  messages,
  type assistantTurns,
  type auditEvents,
  type clientToolDispatches,
  type hostCommandResults,
  type sidechatTables,
  type toolInvocations,
  type turnContextSnapshots,
  type usageRecords,
} from "#drizzle/schema";
import type {
  AssistantTurnRecord,
  AuditEventRecord,
  ClientToolDispatchRecord,
  ContextSnapshotRecord,
  ConversationRecord,
  HostCommandResultRecord,
  MessageRecord,
  ToolInvocationRecord,
  UsageRecord,
} from "#schema-contract";
import { DbRepositoryError } from "../../errors.js";
import {
  isoTimestamp,
  one,
  optionalIsoTimestamp,
} from "../../repository-utils.js";

export const toConversationRecord = (
  row: typeof conversations.$inferSelect,
): ConversationRecord => ({
  conversationId: row.conversationId,
  workspaceId: row.workspaceId,
  subjectId: row.subjectId,
  conversationKey: row.conversationKey,
  status: row.status,
  ...omitNullishField("titleText", row.titleText),
  createdByActorId: row.createdByActorId,
  ...omitNullishField(
    "historyCutoffSequenceIndex",
    row.historyCutoffSequenceIndex,
  ),
  legalHold: row.legalHold,
  createdAt: isoTimestamp(row.createdAt),
  updatedAt: isoTimestamp(row.updatedAt),
  lastMessageAt: isoTimestamp(row.lastMessageAt),
});

export const toMessageRecord = (
  row: typeof messages.$inferSelect,
): MessageRecord => ({
  messageId: row.messageId,
  conversationId: row.conversationId,
  workspaceId: row.workspaceId,
  role: row.role,
  parts: row.parts,
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
  ...omitNullishField("runId", row.runId),
  modelProvider: row.modelProvider,
  modelId: row.modelId,
  instructionsVersion: row.instructionsVersion,
  configVersion: row.configVersion,
  contentFilterVersion: row.contentFilterVersion,
  status: row.status,
  ...omitNullishField("finishReason", row.finishReason),
  ...omitNullishField("errorCode", row.errorCode),
  inputTokens: row.inputTokens,
  outputTokens: row.outputTokens,
  totalTokens: row.totalTokens,
  reasoningTokens: row.reasoningTokens,
  cachedInputTokens: row.cachedInputTokens,
  startedAt: isoTimestamp(row.startedAt),
  ...omitNullishField("completedAt", optionalIsoTimestamp(row.completedAt)),
  createdAt: isoTimestamp(row.startedAt),
  updatedAt: isoTimestamp(row.completedAt ?? row.startedAt),
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

export const toUsageRecord = (
  row: typeof usageRecords.$inferSelect,
): UsageRecord => ({
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
  status: row.status,
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

export const toClientToolDispatchRecord = (
  row: typeof clientToolDispatches.$inferSelect,
): ClientToolDispatchRecord => ({
  clientToolDispatchId: row.clientToolDispatchId,
  assistantTurnId: row.assistantTurnId,
  workspaceId: row.workspaceId,
  toolCallId: row.toolCallId,
  toolName: row.toolName,
  state: row.state,
  ...omitNullishField("outputJson", row.outputJson),
  dispatchedAt: isoTimestamp(row.dispatchedAt),
  ...omitNullishField("completedAt", optionalIsoTimestamp(row.completedAt)),
  ...omitNullishField("lateResultAt", optionalIsoTimestamp(row.lateResultAt)),
  createdAt: isoTimestamp(row.dispatchedAt),
  updatedAt: isoTimestamp(
    row.lateResultAt ?? row.completedAt ?? row.dispatchedAt,
  ),
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
  status: row.status,
  resultCode: row.resultCode,
  commandRedactedJson: row.commandRedactedJson,
  ...omitNullishField("resultRedactedJson", row.resultRedactedJson),
  createdAt: isoTimestamp(row.createdAt),
  updatedAt: isoTimestamp(row.resolvedAt ?? row.createdAt),
  ...omitNullishField("resolvedAt", optionalIsoTimestamp(row.resolvedAt)),
});

export const toAuditEventRecord = (
  row: typeof auditEvents.$inferSelect,
): AuditEventRecord => ({
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
  const conversation = await requireConversation(
    db,
    workspaceId,
    conversationId,
  );
  if (conversation.subjectId !== subjectId) {
    throw new DbRepositoryError(
      "cross_tenant_access_denied",
      "Conversation belongs to a different subject.",
    );
  }
  return conversation;
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

  const where = and(...clauses);
  if (!where) {
    throw new Error(
      "History queries must always keep workspace and conversation constraints.",
    );
  }
  return where;
};
