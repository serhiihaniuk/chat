import { describe, expect, it } from "vitest";

import type {
  assistantTurns,
  conversations,
  hostCommandResults,
  messages,
  toolInvocations,
} from "#drizzle/schema";
import {
  toAssistantTurnRecord,
  toConversationRecord,
  toHostCommandResultRecord,
  toMessageRecord,
  toToolInvocationRecord,
} from "./records/records.js";

const now = "2026-05-23T13:00:00.000Z";

// The node-postgres driver returns `timestamptz` columns in raw PG text form,
// while the contract (and the memory adapter) speaks canonical ISO-8601.
const rawPgTimestamp = "2026-05-23 13:00:00+00";

describe("postgres row record mappers", () => {
  it("omits nullable SQL fields without writing own undefined properties", () => {
    const conversation = toConversationRecord({
      conversationId: "conversation_1",
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      conversationKey: "default",
      status: "active",
      titleText: null,
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

    expectCanonicalOmittedFields(conversation, ["titleText", "historyCutoffSequenceIndex"]);
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

  it("normalizes raw postgres timestamps to canonical ISO across present and absent columns", () => {
    const turn = toAssistantTurnRecord({
      assistantTurnId: "assistant_turn_1",
      requestId: "request_1",
      conversationId: "conversation_1",
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      actorId: "actor_1",
      userMessageId: "message_1",
      assistantMessageId: null,
      runtimeProfile: "fake",
      systemPromptVersion: "system_v1",
      contextStrategyVersion: "context_v1",
      toolRegistryVersion: "tools_v1",
      modelProvider: "fake",
      modelId: "fake-model",
      status: "running",
      finishReason: null,
      errorCode: null,
      startedAt: rawPgTimestamp,
      completedAt: null,
      ownerInstanceId: null,
      leaseExpiresAt: null,
      leaseEpoch: 0,
      cancelRequestedAt: rawPgTimestamp,
    } satisfies typeof assistantTurns.$inferSelect);

    // Both a primary timestamp and the optional cancel-intent column come back ISO,
    // matching the memory adapter so the shared contract holds byte-for-byte.
    expect(turn.startedAt).toBe(now);
    expect(turn.cancelRequestedAt).toBe(now);
    expect(turn.createdAt).toBe(now);
    expect(turn.updatedAt).toBe(now);
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
