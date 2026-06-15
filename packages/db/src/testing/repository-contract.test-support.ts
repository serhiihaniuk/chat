import { describe, expect, it } from "vitest";

import { toTargetId } from "#schema-contract";
import type { SidechatRepositories } from "#repositories/contract";
import {
  actorId,
  appendUserMessage,
  closeIfNeeded,
  createConversation,
  now,
  readConversationHistory,
  subjectId,
  workspaceId,
} from "./repository-contract.helpers.js";

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

        const explicitConversationId = `conversation_${scope}_explicit`;
        const explicit = await repositories.createOrGetConversation({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          actorId: actorId(scope),
          conversationId: explicitConversationId,
          conversationKey: explicitConversationId,
          now,
        });

        expect(explicit.record.conversationId).toBe(explicitConversationId);

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
        await appendUserMessage(repositories, scope, conversation.conversationId);

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
        const emptyPostResetHistory = await readConversationHistory(
          repositories,
          scope,
          conversation.conversationId,
        );
        await repositories.appendMessage({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          conversationId: conversation.conversationId,
          role: "user",
          contentText: "after reset",
          metadataJson: {},
          idempotencyKey: { value: "request_after_reset:user" },
          now,
        });
        const postResetHistory = await readConversationHistory(
          repositories,
          scope,
          conversation.conversationId,
        );

        expect(reset.status).toBe("reset");
        expect(reset.historyCutoffSequenceIndex).toBe(0);
        expect(emptyPostResetHistory).toEqual([]);
        expect(postResetHistory.map((message) => message.contentText)).toEqual(["after reset"]);
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
        expectCanonicalOmittedFields(turn.record, [
          "assistantMessageId",
          "finishReason",
          "errorCode",
          "completedAt",
        ]);

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
          targetId: toTargetId(conversation.conversationId),
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
        expectCanonicalOmittedFields(context.record, ["hostSurfaceId"]);
        expect(usage.record.totalTokens).toBe(3);
        expectCanonicalOmittedFields(usage.record, ["providerRequestId"]);
        await expect(
          repositories.readUsageSummary({ workspaceId: workspaceId(scope) }),
        ).resolves.toEqual({
          inputTokens: 1,
          outputTokens: 2,
          totalTokens: 3,
        });
        expect(tool.record.outputHash).toBe("output_hash");
        expectCanonicalOmittedFields(tool.record, ["errorCode"]);
        expect(host.record.status).toBe("emitted");
        expectCanonicalOmittedFields(host.record, ["resultRedactedJson", "resolvedAt"]);
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
