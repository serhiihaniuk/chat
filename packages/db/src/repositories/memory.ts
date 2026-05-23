import type {
  AssistantTurnRecord,
  AuditEventRecord,
  ContextSnapshotRecord,
  ConversationRecord,
  HostCommandResultRecord,
  MessageRecord,
  ToolInvocationRecord,
  UsageRecord,
} from "../schema-contract/index.js";
import type { SidechatRepositories } from "./contract.js";
import { DbRepositoryError } from "./errors.js";
import {
  createMemoryStore,
  replaceConversation,
  snapshotMemoryStore,
  updateTurn,
  upsertAt,
  type MemoryStoreSnapshot,
} from "./memory-store.js";
import { createIdGenerator, result } from "./repository-utils.js";

export type MemorySidechatRepositories = SidechatRepositories & {
  readonly snapshot: () => MemoryStoreSnapshot;
};

export type MemoryRepositoryOptions = {
  readonly idPrefix?: string;
};

export const createMemorySidechatRepositories = (
  options: MemoryRepositoryOptions = {},
): MemorySidechatRepositories => {
  const ids = createIdGenerator(options.idPrefix ?? "mem");
  const store = createMemoryStore();

  const getConversation = (
    workspaceId: string,
    conversationId: string,
  ): ConversationRecord => {
    const conversation = store.conversations.find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.conversationId === conversationId,
    );
    if (!conversation) {
      throw new DbRepositoryError(
        "record_not_found",
        "Conversation does not exist in the requested workspace.",
      );
    }
    return conversation;
  };

  const requireSubjectConversation = (
    workspaceId: string,
    subjectId: string,
    conversationId: string,
  ): ConversationRecord => {
    const conversation = getConversation(workspaceId, conversationId);
    if (conversation.subjectId !== subjectId) {
      throw new DbRepositoryError(
        "cross_tenant_access_denied",
        "Conversation belongs to a different subject.",
      );
    }
    return conversation;
  };

  return {
    snapshot: () => snapshotMemoryStore(store),
    createOrGetConversation: async (command) => {
      await Promise.resolve();
      const existing = store.conversations.find(
        (conversation) =>
          conversation.workspaceId === command.workspaceId &&
          conversation.subjectId === command.subjectId &&
          conversation.conversationKey === command.conversationKey,
      );
      if (existing) return result(existing, false);

      const conversation: ConversationRecord = {
        workspaceId: command.workspaceId,
        conversationId: ids.next("conversation"),
        subjectId: command.subjectId,
        conversationKey: command.conversationKey,
        status: "active",
        createdByActorId: command.actorId,
        createdAt: command.now,
        updatedAt: command.now,
        lastMessageAt: command.now,
      };
      store.conversations.push(conversation);
      return result(conversation, true);
    },
    appendMessage: async (command) => {
      await Promise.resolve();
      const conversation = requireSubjectConversation(
        command.workspaceId,
        command.subjectId,
        command.conversationId,
      );
      const existing = store.messages.find(
        (message) =>
          message.workspaceId === command.workspaceId &&
          message.idempotencyKey === command.idempotencyKey.value,
      );
      if (existing) return result(existing, false);

      const sequenceIndex = store.messages.filter(
        (message) =>
          message.workspaceId === command.workspaceId &&
          message.conversationId === command.conversationId,
      ).length;
      const message: MessageRecord = {
        workspaceId: command.workspaceId,
        messageId: ids.next("message"),
        conversationId: command.conversationId,
        role: command.role,
        contentText: command.contentText,
        metadataJson: command.metadataJson,
        sequenceIndex,
        idempotencyKey: command.idempotencyKey.value,
        createdAt: command.now,
        updatedAt: command.now,
      };
      store.messages.push(message);
      replaceConversation(store, {
        ...conversation,
        updatedAt: command.now,
        lastMessageAt: command.now,
      });
      return result(message, true);
    },
    readConversationHistory: async (command) => {
      await Promise.resolve();
      requireSubjectConversation(
        command.workspaceId,
        command.subjectId,
        command.conversationId,
      );
      return store.messages
        .filter(
          (message) =>
            message.workspaceId === command.workspaceId &&
            message.conversationId === command.conversationId &&
            (command.beforeSequenceIndex === undefined ||
              message.sequenceIndex < command.beforeSequenceIndex),
        )
        .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
        .slice(-command.limit);
    },
    resetConversation: async (command) => {
      await Promise.resolve();
      const conversation = requireSubjectConversation(
        command.workspaceId,
        command.subjectId,
        command.conversationId,
      );
      const reset = {
        ...conversation,
        status: "reset" as const,
        updatedAt: command.now,
      };
      replaceConversation(store, reset);
      return reset;
    },
    startAssistantTurn: async (command) => {
      await Promise.resolve();
      requireSubjectConversation(
        command.workspaceId,
        command.subjectId,
        command.conversationId,
      );
      const existing = store.assistantTurns.find(
        (turn) =>
          turn.workspaceId === command.workspaceId &&
          turn.requestId === command.requestId,
      );
      if (existing) return result(existing, false);

      const turn: AssistantTurnRecord = {
        workspaceId: command.workspaceId,
        assistantTurnId: ids.next("assistant_turn"),
        requestId: command.requestId,
        conversationId: command.conversationId,
        subjectId: command.subjectId,
        actorId: command.actorId,
        userMessageId: command.userMessageId,
        runtimeProfile: command.runtimeProfile,
        systemPromptVersion: command.systemPromptVersion,
        contextStrategyVersion: command.contextStrategyVersion,
        toolRegistryVersion: command.toolRegistryVersion,
        modelProvider: command.modelProvider,
        modelId: command.modelId,
        status: "running",
        startedAt: command.now,
        createdAt: command.now,
        updatedAt: command.now,
      };
      store.assistantTurns.push(turn);
      return result(turn, true);
    },
    recordTurnContextSnapshot: async (command) => {
      await Promise.resolve();
      const existing = store.contextSnapshots.find(
        (snapshot) =>
          snapshot.workspaceId === command.workspaceId &&
          snapshot.assistantTurnId === command.assistantTurnId,
      );
      if (existing) return result(existing, false);

      const snapshot: ContextSnapshotRecord = {
        workspaceId: command.workspaceId,
        contextSnapshotId: ids.next("context_snapshot"),
        assistantTurnId: command.assistantTurnId,
        contextSchemaVersion: command.contextSchemaVersion,
        ...(command.hostSurfaceId
          ? { hostSurfaceId: command.hostSurfaceId }
          : {}),
        hostContextHash: command.hostContextHash,
        capabilitiesHash: command.capabilitiesHash,
        contextRedactedJson: command.contextRedactedJson,
        createdAt: command.now,
        updatedAt: command.now,
      };
      store.contextSnapshots.push(snapshot);
      return result(snapshot, true);
    },
    completeAssistantTurn: (command) =>
      Promise.resolve().then(() =>
        updateTurn(command, store, {
          status: "completed",
          assistantMessageId: command.assistantMessageId,
          finishReason: command.finishReason,
          completedAt: command.now,
        }),
      ),
    failAssistantTurn: (command) =>
      Promise.resolve().then(() =>
        updateTurn(command, store, {
          status: command.status,
          errorCode: command.errorCode,
          completedAt: command.now,
        }),
      ),
    recordUsage: async (command) => {
      await Promise.resolve();
      const existing = store.usageRecords.find(
        (usage) =>
          usage.workspaceId === command.workspaceId &&
          usage.assistantTurnId === command.assistantTurnId &&
          usage.runtimeStepIndex === command.runtimeStepIndex,
      );
      if (existing) return result(existing, false);

      const usage: UsageRecord = {
        workspaceId: command.workspaceId,
        usageRecordId: ids.next("usage"),
        assistantTurnId: command.assistantTurnId,
        runtimeStepIndex: command.runtimeStepIndex,
        modelProvider: command.modelProvider,
        modelId: command.modelId,
        ...(command.providerRequestId
          ? { providerRequestId: command.providerRequestId }
          : {}),
        inputTokens: command.inputTokens,
        outputTokens: command.outputTokens,
        reasoningTokens: command.reasoningTokens,
        cachedInputTokens: command.cachedInputTokens,
        totalTokens: command.totalTokens,
        costUnits: command.costUnits,
        createdAt: command.now,
        updatedAt: command.now,
      };
      store.usageRecords.push(usage);
      return result(usage, true);
    },
    recordToolInvocation: async (command) => {
      await Promise.resolve();
      const existingIndex = store.toolInvocations.findIndex(
        (tool) =>
          tool.workspaceId === command.workspaceId &&
          tool.assistantTurnId === command.assistantTurnId &&
          tool.toolCallId === command.toolCallId,
      );
      const tool: ToolInvocationRecord = {
        workspaceId: command.workspaceId,
        toolInvocationId:
          existingIndex >= 0
            ? store.toolInvocations[existingIndex]!.toolInvocationId
            : ids.next("tool_invocation"),
        assistantTurnId: command.assistantTurnId,
        runtimeStepIndex: command.runtimeStepIndex,
        toolCallId: command.toolCallId,
        toolName: command.toolName,
        status: command.status,
        inputHash: command.inputHash,
        ...(command.outputHash ? { outputHash: command.outputHash } : {}),
        inputRedactedJson: command.inputRedactedJson,
        ...(command.outputRedactedJson
          ? { outputRedactedJson: command.outputRedactedJson }
          : {}),
        ...(command.errorCode ? { errorCode: command.errorCode } : {}),
        startedAt: command.startedAt,
        ...(command.completedAt ? { completedAt: command.completedAt } : {}),
        createdAt: command.now,
        updatedAt: command.now,
      };
      upsertAt(store.toolInvocations, existingIndex, tool);
      return result(tool, existingIndex < 0);
    },
    recordHostCommandResult: async (command) => {
      await Promise.resolve();
      const existingIndex = store.hostCommandResults.findIndex(
        (hostCommand) =>
          hostCommand.workspaceId === command.workspaceId &&
          hostCommand.assistantTurnId === command.assistantTurnId &&
          hostCommand.commandId === command.commandId,
      );
      const hostCommand: HostCommandResultRecord = {
        workspaceId: command.workspaceId,
        hostCommandId:
          existingIndex >= 0
            ? store.hostCommandResults[existingIndex]!.hostCommandId
            : ids.next("host_command"),
        assistantTurnId: command.assistantTurnId,
        commandId: command.commandId,
        commandType: command.commandType,
        ...(command.resourceId ? { resourceId: command.resourceId } : {}),
        status: command.status,
        resultCode: command.resultCode,
        commandRedactedJson: command.commandRedactedJson,
        ...(command.resultRedactedJson
          ? { resultRedactedJson: command.resultRedactedJson }
          : {}),
        createdAt: command.now,
        updatedAt: command.now,
        ...(command.resolvedAt ? { resolvedAt: command.resolvedAt } : {}),
      };
      upsertAt(store.hostCommandResults, existingIndex, hostCommand);
      return result(hostCommand, existingIndex < 0);
    },
    appendAuditEvent: async (command) => {
      await Promise.resolve();
      const auditEvent: AuditEventRecord = {
        workspaceId: command.workspaceId,
        auditEventId: ids.next("audit_event"),
        subjectId: command.subjectId,
        actorId: command.actorId,
        eventType: command.eventType,
        targetType: command.targetType,
        targetId: command.targetId,
        metadataJson: command.metadataJson,
        requestId: command.requestId,
        createdAt: command.now,
        updatedAt: command.now,
      };
      store.auditEvents.push(auditEvent);
      return result(auditEvent, true);
    },
  };
};
