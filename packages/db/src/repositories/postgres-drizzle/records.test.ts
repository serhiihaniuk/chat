import { describe, expect, it } from "vitest";

import type { conversations, hostCommandResults, messages, toolInvocations } from "#drizzle/schema";
import {
  toConversationRecord,
  toHostCommandResultRecord,
  toMessageRecord,
  toToolInvocationRecord,
} from "./records/records.js";

const now = "2026-05-23T13:00:00.000Z";

describe("postgres row record mappers", () => {
  it("omits nullable SQL fields without writing own undefined properties", () => {
    const conversation = toConversationRecord({
      conversationId: "conversation_1",
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      conversationKey: "default",
      status: "active",
      createdByActorId: "actor_1",
      historyCutoffSequenceIndex: null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    } satisfies typeof conversations.$inferSelect);
    const message = toMessageRecord({
      messageId: "message_1",
      conversationId: "conversation_1",
      workspaceId: "workspace_1",
      role: "user",
      contentText: "hello",
      metadataJson: {},
      sequenceIndex: 0,
      idempotencyKey: null,
      createdAt: now,
    } satisfies typeof messages.$inferSelect);
    const tool = toToolInvocationRecord({
      toolInvocationId: "tool_invocation_1",
      assistantTurnId: "assistant_turn_1",
      workspaceId: "workspace_1",
      runtimeStepIndex: 0,
      toolCallId: "tool_1",
      toolName: "lookup",
      status: "running",
      inputHash: "input_hash",
      outputHash: null,
      inputRedactedJson: {},
      outputRedactedJson: null,
      errorCode: null,
      startedAt: now,
      completedAt: null,
    } satisfies typeof toolInvocations.$inferSelect);
    const hostCommand = toHostCommandResultRecord({
      hostCommandId: "host_command_result_1",
      assistantTurnId: "assistant_turn_1",
      workspaceId: "workspace_1",
      commandId: "command_1",
      commandType: "open_resource",
      resourceId: null,
      status: "emitted",
      resultCode: "emitted",
      commandRedactedJson: {},
      resultRedactedJson: null,
      createdAt: now,
      resolvedAt: null,
    } satisfies typeof hostCommandResults.$inferSelect);

    expectCanonicalOmittedFields(conversation, ["historyCutoffSequenceIndex"]);
    expectCanonicalOmittedFields(message, ["idempotencyKey"]);
    expectCanonicalOmittedFields(tool, [
      "outputHash",
      "outputRedactedJson",
      "errorCode",
      "completedAt",
    ]);
    expectCanonicalOmittedFields(hostCommand, ["resourceId", "resultRedactedJson", "resolvedAt"]);
  });

  it("preserves present falsy SQL string values", () => {
    const message = toMessageRecord({
      messageId: "message_1",
      conversationId: "conversation_1",
      workspaceId: "workspace_1",
      role: "user",
      contentText: "hello",
      metadataJson: {},
      sequenceIndex: 0,
      idempotencyKey: "",
      createdAt: now,
    } satisfies typeof messages.$inferSelect);
    const tool = toToolInvocationRecord({
      toolInvocationId: "tool_invocation_1",
      assistantTurnId: "assistant_turn_1",
      workspaceId: "workspace_1",
      runtimeStepIndex: 0,
      toolCallId: "tool_1",
      toolName: "lookup",
      status: "failed",
      inputHash: "input_hash",
      outputHash: "",
      inputRedactedJson: {},
      outputRedactedJson: {},
      errorCode: "",
      startedAt: now,
      completedAt: now,
    } satisfies typeof toolInvocations.$inferSelect);

    expect(message.idempotencyKey).toBe("");
    expect(tool.outputHash).toBe("");
    expect(tool.errorCode).toBe("");
  });
});

const expectCanonicalOmittedFields = (
  record: Record<string, unknown>,
  fieldNames: readonly string[],
): void => {
  for (const fieldName of fieldNames) {
    expect(Object.hasOwn(record, fieldName)).toBe(false);
  }
  for (const fieldValue of Object.values(record)) {
    expect(fieldValue).not.toBeUndefined();
  }
};
