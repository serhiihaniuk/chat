import { describe, expect, it } from "vitest";

import {
  toAssistantMessageId,
  toMessageId,
  toTargetId,
  toUserMessageId,
  type ConversationId,
  type MessageRecord,
  type StartAssistantTurnCommand,
  type UserMessageId,
} from "#schema-contract";
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

/** The first text part of a message body — the v7 durable `parts` shape. */
const textOf = (message: MessageRecord): string | undefined => {
  for (const part of message.parts) {
    if (part["type"] === "text" && typeof part["text"] === "string")
      return part["text"];
  }
  return undefined;
};

const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
} as const;

export const sidechatRepositoryContract = (
  label: string,
  createRepositories: () => SidechatRepositories,
) => {
  let scopeCounter = 0;
  const nextScope = () => `${label.replace(/\W+/gu, "_")}_${++scopeCounter}`;

  // The provenance a running turn carries in v7 — exactly which model, prompt,
  // config, and content-filter version produced it.
  const startCommand = (
    scope: string,
    conversationId: ConversationId,
    userMessageId: UserMessageId,
    requestId: string,
  ): StartAssistantTurnCommand => ({
    workspaceId: workspaceId(scope),
    subjectId: subjectId(scope),
    actorId: actorId(scope),
    requestId,
    conversationId,
    userMessageId,
    modelProvider: "fake",
    modelId: "fake-model",
    instructionsVersion: "instructions_v1",
    configVersion: "config_v1",
    contentFilterVersion: "filter_v1",
    now,
  });

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
        expect(repeated.record.conversationId).toBe(
          conversation.conversationId,
        );
        // legal_hold rides through create/read; a fresh conversation is not held.
        expect(repeated.record.legalHold).toBe(false);

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

        // The same messageId replays idempotently: one row, same id, no re-insert.
        const first = await appendUserMessage(
          repositories,
          scope,
          conversation.conversationId,
        );
        const second = await appendUserMessage(
          repositories,
          scope,
          conversation.conversationId,
        );

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
        await appendUserMessage(
          repositories,
          scope,
          conversation.conversationId,
        );

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
          messageId: toMessageId(`${conversation.conversationId}:after_reset`),
          role: "user",
          parts: [{ type: "text", text: "after reset" }],
          metadataJson: {},
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
        expect(postResetHistory.map(textOf)).toEqual(["after reset"]);
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("guards a second concurrent turn on a busy conversation and replays the same request", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const conversation = await createConversation(repositories, scope);
        const userMessage = await appendUserMessage(
          repositories,
          scope,
          conversation.conversationId,
        );
        const userMessageId = toUserMessageId(userMessage.record.messageId);

        const started = await repositories.startAssistantTurn(
          startCommand(
            scope,
            conversation.conversationId,
            userMessageId,
            "request_1",
          ),
        );
        expect(started.inserted).toBe(true);
        expect(started.record.status).toBe("running");

        // Same request id: the SELECT-first path returns the running turn as an
        // idempotent replay — it must not be mistaken for a busy conversation.
        const replay = await repositories.startAssistantTurn(
          startCommand(
            scope,
            conversation.conversationId,
            userMessageId,
            "request_1",
          ),
        );
        expect(replay.inserted).toBe(false);
        expect(replay.record.assistantTurnId).toBe(
          started.record.assistantTurnId,
        );

        // A different request id while the first is still running trips the
        // one-running-per-conversation partial unique index — the busy guard.
        await expect(
          repositories.startAssistantTurn(
            startCommand(
              scope,
              conversation.conversationId,
              userMessageId,
              "request_2",
            ),
          ),
        ).rejects.toMatchObject({ code: "conversation_busy" });
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
          messageId: toMessageId(`${conversation.conversationId}:assistant`),
          role: "assistant",
          parts: [{ type: "text", text: "hello back" }],
          metadataJson: {},
          now,
        });
        const userMessageId = toUserMessageId(userMessage.record.messageId);
        const turn = await repositories.startAssistantTurn(
          startCommand(
            scope,
            conversation.conversationId,
            userMessageId,
            "request_1",
          ),
        );
        const repeatedTurn = await repositories.startAssistantTurn(
          startCommand(
            scope,
            conversation.conversationId,
            userMessageId,
            "request_1",
          ),
        );

        expect(repeatedTurn.inserted).toBe(false);
        expect(repeatedTurn.record.assistantTurnId).toBe(
          turn.record.assistantTurnId,
        );
        expectCanonicalOmittedFields(turn.record, [
          "assistantMessageId",
          "runId",
          "finishReason",
          "errorCode",
          "completedAt",
        ]);

        // A run id binds once the durable run starts; the bind is idempotent.
        const bound = await repositories.bindTurnRun({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.record.assistantTurnId,
          runId: "run_1",
          now,
        });
        expect(bound.runId).toBe("run_1");

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
        const completed = await repositories.claimAssistantTurnTerminal({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.record.assistantTurnId,
          status: "completed",
          assistantMessageId: toAssistantMessageId(
            assistantMessage.record.messageId,
          ),
          finishReason: "stop",
          usage: {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
          now,
        });
        // A second finalize is a no-op: the guarded CAS matches no running row, so
        // the folded usage stays put and `claimed` is false.
        const replayFinalize = await repositories.claimAssistantTurnTerminal({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.record.assistantTurnId,
          status: "failed",
          errorCode: "should_not_apply",
          usage: ZERO_USAGE,
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
        expectCanonicalOmittedFields(host.record, [
          "resultRedactedJson",
          "resolvedAt",
        ]);
        expect(audit.record.eventType).toBe("conversation.created");
        expect(completed.claimed).toBe(true);
        expect(completed.record.status).toBe("completed");
        expect(completed.record.totalTokens).toBe(3);
        expect(replayFinalize.claimed).toBe(false);
        expect(replayFinalize.record.status).toBe("completed");
        expect(replayFinalize.record.totalTokens).toBe(3);
        expect(history.map(textOf)).toEqual(["hello", "hello back"]);
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
