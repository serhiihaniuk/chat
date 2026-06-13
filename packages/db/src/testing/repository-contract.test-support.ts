import { describe, expect, it } from "vitest";

import type { SidechatRepositories } from "#repositories/contract";

const now = "2026-05-23T13:00:00.000Z";

export const sidechatRepositoryContract = (
  label: string,
  createRepositories: () => SidechatRepositories,
) => {
  let scopeCounter = 0;
  const nextScope = () => `${label.replace(/\W+/gu, "_")}_${++scopeCounter}`;

  describe("sidechat repository contract", () => {
    it("proves conversation and message idempotency", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const conversation = await createConversation(repositories, scope);
        const repeated = await repositories.createOrGetConversation({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          actorId: actorId(scope),
          conversationKey: "default",
          now,
        });

        expect(repeated.inserted).toBe(false);
        expect(repeated.record.conversationId).toBe(conversation.conversationId);

        const first = await appendUserMessage(repositories, scope, conversation.conversationId);
        const second = await appendUserMessage(repositories, scope, conversation.conversationId);

        expect(first.inserted).toBe(true);
        expect(second.inserted).toBe(false);
        expect(second.record.messageId).toBe(first.record.messageId);
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("denies cross-subject history reads and supports reset", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const conversation = await createConversation(repositories, scope);

        await expect(
          repositories.readConversationHistory({
            workspaceId: workspaceId(scope),
            subjectId: "other_subject",
            conversationId: conversation.conversationId,
            limit: 10,
          }),
        ).rejects.toMatchObject({
          code: "cross_tenant_access_denied",
        });

        const reset = await repositories.resetConversation({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          actorId: actorId(scope),
          conversationId: conversation.conversationId,
          requestId: "reset_1",
          now,
        });

        expect(reset.status).toBe("reset");
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("records assistant turns, context, usage, tool, host, audit DTOs, and history ordering", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const conversation = await createConversation(repositories, scope);
        const userMessage = await appendUserMessage(
          repositories,
          scope,
          conversation.conversationId,
        );
        const assistantMessage = await repositories.appendMessage({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          conversationId: conversation.conversationId,
          role: "assistant",
          contentText: "hello back",
          metadataJson: {},
          idempotencyKey: { value: "request_1:assistant" },
          now,
        });
        const turn = await repositories.startAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          actorId: actorId(scope),
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
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          actorId: actorId(scope),
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
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.record.assistantTurnId,
          contextSchemaVersion: "host-context.v1",
          hostContextHash: "ctx_hash",
          capabilitiesHash: "cap_hash",
          contextRedactedJson: { title: "Host" },
          now,
        });
        const usage = await repositories.recordUsage({
          workspaceId: workspaceId(scope),
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
          workspaceId: workspaceId(scope),
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
          workspaceId: workspaceId(scope),
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
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          actorId: actorId(scope),
          eventType: "conversation.created",
          targetType: "conversation",
          targetId: conversation.conversationId,
          requestId: "request_1",
          metadataJson: {},
          now,
        });
        const completed = await repositories.completeAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.record.assistantTurnId,
          assistantMessageId: assistantMessage.record.messageId,
          finishReason: "stop",
          now,
        });
        const history = await repositories.readConversationHistory({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          conversationId: conversation.conversationId,
          limit: 10,
        });

        expect(context.record.contextRedactedJson).toEqual({ title: "Host" });
        expect(usage.record.totalTokens).toBe(3);
        await expect(
          repositories.readUsageSummary({ workspaceId: workspaceId(scope) }),
        ).resolves.toEqual({
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
        });
        expect(tool.record.outputHash).toBe("output_hash");
        expect(host.record.status).toBe("emitted");
        expect(audit.record.eventType).toBe("conversation.created");
        expect(completed.status).toBe("completed");
        expect(history.map((message) => message.contentText)).toEqual(["hello", "hello back"]);
        expect(history.map((message) => message.sequenceIndex)).toEqual([0, 1]);
      } finally {
        await closeIfNeeded(repositories);
      }
    });
  });
};

const createConversation = async (repositories: SidechatRepositories, scope: string) => {
  const conversation = await repositories.createOrGetConversation({
    workspaceId: workspaceId(scope),
    subjectId: subjectId(scope),
    actorId: actorId(scope),
    conversationKey: "default",
    now,
  });
  return conversation.record;
};

const appendUserMessage = (
  repositories: SidechatRepositories,
  scope: string,
  conversationId: string,
) =>
  repositories.appendMessage({
    workspaceId: workspaceId(scope),
    subjectId: subjectId(scope),
    conversationId,
    role: "user",
    contentText: "hello",
    metadataJson: {},
    idempotencyKey: { value: "request_1:user" },
    now,
  });

const workspaceId = (scope: string) => `workspace_${scope}`;
const subjectId = (scope: string) => `subject_${scope}`;
const actorId = (scope: string) => `actor_${scope}`;

const closeIfNeeded = async (repositories: SidechatRepositories): Promise<void> => {
  if (hasClose(repositories)) {
    await repositories.close();
  }
};

const hasClose = (
  repositories: SidechatRepositories,
): repositories is SidechatRepositories & { readonly close: () => Promise<void> } =>
  "close" in repositories && typeof repositories["close"] === "function";
