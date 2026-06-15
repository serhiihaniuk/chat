import type {
  AppendAuditEventCommand,
  RecordHostCommandResultCommand,
  RecordToolInvocationCommand,
} from "#schema-contract/repositories";
import type {
  AuditEventRecord,
  HostCommandResultRecord,
  ToolInvocationRecord,
} from "#schema-contract";
import { omitUndefinedProperties } from "@side-chat/shared";
import { upsertAt, type MemoryStore } from "../store/store.js";
import { result, type createIdGenerator } from "../../repository-utils.js";

type MemoryIds = ReturnType<typeof createIdGenerator>;

export const recordMemoryToolInvocation = async (
  command: RecordToolInvocationCommand,
  store: MemoryStore,
  ids: MemoryIds,
) => {
  await Promise.resolve();
  const existingIndex = store.toolInvocations.findIndex(
    (tool) =>
      tool.workspaceId === command.workspaceId &&
      tool.assistantTurnId === command.assistantTurnId &&
      tool.toolCallId === command.toolCallId,
  );
  const tool: ToolInvocationRecord = omitUndefinedProperties({
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
    outputHash: command.outputHash,
    inputRedactedJson: command.inputRedactedJson,
    outputRedactedJson: command.outputRedactedJson,
    errorCode: command.errorCode,
    startedAt: command.startedAt,
    completedAt: command.completedAt,
    createdAt: command.now,
    updatedAt: command.now,
  });
  upsertAt(store.toolInvocations, existingIndex, tool);
  return result(tool, existingIndex < 0);
};

export const recordMemoryHostCommandResult = async (
  command: RecordHostCommandResultCommand,
  store: MemoryStore,
  ids: MemoryIds,
) => {
  await Promise.resolve();
  const existingIndex = store.hostCommandResults.findIndex(
    (hostCommand) =>
      hostCommand.workspaceId === command.workspaceId &&
      hostCommand.assistantTurnId === command.assistantTurnId &&
      hostCommand.commandId === command.commandId,
  );
  const hostCommand: HostCommandResultRecord = omitUndefinedProperties({
    workspaceId: command.workspaceId,
    hostCommandId:
      existingIndex >= 0
        ? store.hostCommandResults[existingIndex]!.hostCommandId
        : ids.next("host_command"),
    assistantTurnId: command.assistantTurnId,
    commandId: command.commandId,
    commandType: command.commandType,
    resourceId: command.resourceId,
    status: command.status,
    resultCode: command.resultCode,
    commandRedactedJson: command.commandRedactedJson,
    resultRedactedJson: command.resultRedactedJson,
    createdAt: command.now,
    updatedAt: command.now,
    resolvedAt: command.resolvedAt,
  });
  upsertAt(store.hostCommandResults, existingIndex, hostCommand);
  return result(hostCommand, existingIndex < 0);
};

export const appendMemoryAuditEvent = async (
  command: AppendAuditEventCommand,
  store: MemoryStore,
  ids: MemoryIds,
) => {
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
};
