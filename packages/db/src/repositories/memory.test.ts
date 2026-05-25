import { describe, expect, it } from "vitest";

import { createMemorySidechatRepositories } from "./memory.js";

const now = "2026-05-23T13:00:00.000Z";

const createConversation = async () => {
  const repositories = createMemorySidechatRepositories({ idPrefix: "test" });
  const conversation = await repositories.createOrGetConversation({
    workspaceId: "workspace_1",
    subjectId: "subject_1",
    actorId: "actor_1",
    conversationKey: "default",
    now,
  });
  return { repositories, conversation: conversation.record };
};

describe("memory sidechat repositories", () => {
  it("proves conversation and message idempotency", async () => {
    const { repositories, conversation } = await createConversation();
    const repeated = await repositories.createOrGetConversation({
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      actorId: "actor_1",
      conversationKey: "default",
      now,
    });

    expect(repeated.inserted).toBe(false);
    expect(repeated.record.conversationId).toBe(conversation.conversationId);

    const command = {
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      conversationId: conversation.conversationId,
      role: "user" as const,
      contentText: "hello",
      metadataJson: {},
      idempotencyKey: { value: "request_1:user" },
      now,
    };
    const first = await repositories.appendMessage(command);
    const second = await repositories.appendMessage(command);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.record.messageId).toBe(first.record.messageId);
  });

  it("denies cross-subject history reads and supports reset", async () => {
    const { repositories, conversation } = await createConversation();

    await expect(
      repositories.readConversationHistory({
        workspaceId: "workspace_1",
        subjectId: "other_subject",
        conversationId: conversation.conversationId,
        limit: 10,
      }),
    ).rejects.toMatchObject({
      code: "cross_tenant_access_denied",
    });

    const reset = await repositories.resetConversation({
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      actorId: "actor_1",
      conversationId: conversation.conversationId,
      requestId: "reset_1",
      now,
    });

    expect(reset.status).toBe("reset");
  });

  it("records turn context, usage, tool, host, and audit DTOs", async () => {
    const { repositories, conversation } = await createConversation();
    const userMessage = await repositories.appendMessage({
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      conversationId: conversation.conversationId,
      role: "user",
      contentText: "hello",
      metadataJson: {},
      idempotencyKey: { value: "request_1:user" },
      now,
    });
    const turn = await repositories.startAssistantTurn({
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      actorId: "actor_1",
      requestId: "request_1",
      conversationId: conversation.conversationId,
      userMessageId: userMessage.record.messageId,
      runtimeProfile: "fake",
      systemPromptVersion: "system_v1",
      contextStrategyVersion: "context_v1",
      toolRegistryVersion: "tools_v1",
      modelProvider: "fake",
      modelId: "fake-model",
      now,
    });
    const repeatedTurn = await repositories.startAssistantTurn({
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      actorId: "actor_1",
      requestId: "request_1",
      conversationId: conversation.conversationId,
      userMessageId: userMessage.record.messageId,
      runtimeProfile: "fake",
      systemPromptVersion: "system_v1",
      contextStrategyVersion: "context_v1",
      toolRegistryVersion: "tools_v1",
      modelProvider: "fake",
      modelId: "fake-model",
      now,
    });

    expect(repeatedTurn.inserted).toBe(false);
    expect(repeatedTurn.record.assistantTurnId).toBe(turn.record.assistantTurnId);

    const context = await repositories.recordTurnContextSnapshot({
      workspaceId: "workspace_1",
      assistantTurnId: turn.record.assistantTurnId,
      contextSchemaVersion: "host-context.v1",
      hostContextHash: "ctx_hash",
      capabilitiesHash: "cap_hash",
      contextRedactedJson: { title: "Host" },
      now,
    });
    const usage = await repositories.recordUsage({
      workspaceId: "workspace_1",
      assistantTurnId: turn.record.assistantTurnId,
      runtimeStepIndex: 0,
      modelProvider: "fake",
      modelId: "fake-model",
      inputTokens: 1,
      outputTokens: 2,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 3,
      costUnits: "0",
      now,
    });
    const tool = await repositories.recordToolInvocation({
      workspaceId: "workspace_1",
      assistantTurnId: turn.record.assistantTurnId,
      runtimeStepIndex: 1,
      toolCallId: "tool_1",
      toolName: "lookup",
      status: "completed",
      inputHash: "input_hash",
      outputHash: "output_hash",
      inputRedactedJson: {},
      outputRedactedJson: {},
      startedAt: now,
      completedAt: now,
      now,
    });
    const host = await repositories.recordHostCommandResult({
      workspaceId: "workspace_1",
      assistantTurnId: turn.record.assistantTurnId,
      commandId: "command_1",
      commandType: "open_resource",
      resourceId: "doc_1",
      status: "emitted",
      resultCode: "emitted",
      commandRedactedJson: { resourceId: "doc_1" },
      now,
    });
    const audit = await repositories.appendAuditEvent({
      workspaceId: "workspace_1",
      subjectId: "subject_1",
      actorId: "actor_1",
      eventType: "conversation.created",
      targetType: "conversation",
      targetId: conversation.conversationId,
      requestId: "request_1",
      metadataJson: {},
      now,
    });

    expect(context.record.contextRedactedJson).toEqual({ title: "Host" });
    expect(usage.record.totalTokens).toBe(3);
    expect(tool.record.outputHash).toBe("output_hash");
    expect(host.record.status).toBe("emitted");
    expect(audit.record.eventType).toBe("conversation.created");
  });
});
