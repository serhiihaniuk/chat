import {
  DbRepositoryError,
  TURN_CANCELLATION_DISPOSITIONS,
  uniqueViolationConstraint,
  type SidechatRepositories,
} from "@side-chat/db";
import { toJsonObject } from "@side-chat/shared";

import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import {
  CANCEL_REQUEST_DISPOSITIONS,
  TURN_CLAIM_DISPOSITIONS,
  type BeginTurnInput,
  type TurnCancellationStore,
  type TurnExecutionClaimStore,
  type TurnStore,
} from "#application/ports/turn/turn-store";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";
import { TURN_MESSAGE_ROLES } from "#domain/turn/turn";

import type { TurnStateContext } from "../types.js";

const CONVERSATIONS_PRIMARY_KEY_CONSTRAINT = "conversations_pkey";
const TURN_RECOVERY_GRACE_MS = 60_000;

// Provenance columns are non-null, so an open turn needs some value before
// model selection. Step 18 replaces these placeholders with real provenance.
const PENDING_PROVENANCE = {
  modelProvider: "pending",
  modelId: "pending",
  instructionsVersion: "v1",
  configVersion: "v1",
  contentFilterVersion: "v1",
} as const;

type TurnLifecycle = Pick<
  ConversationStore & TurnStore & TurnExecutionClaimStore & TurnCancellationStore & TurnRunAccess,
  | "assertOwned"
  | "assertCanBegin"
  | "beginTurn"
  | "bindRun"
  | "claimRun"
  | "assertRunOwned"
  | "requestCancellation"
  | "assertAccessible"
  | "finalize"
>;

/** Maps turn lifecycle ports to database repositories and their error contract. */
export const createPostgresTurnLifecycle = (context: TurnStateContext): TurnLifecycle => ({
  assertOwned: assertOwned(context),
  assertCanBegin: assertCanBegin(context),
  beginTurn: beginTurn(context),
  bindRun: bindRun(context),
  claimRun: claimRun(context),
  assertRunOwned: assertRunOwned(context),
  requestCancellation: requestCancellation(context),
  assertAccessible: assertRunAccessible(context),
  finalize: finalize(context),
});

const assertOwned =
  ({ repositories }: TurnStateContext): ConversationStore["assertOwned"] =>
  async (auth, conversationId) => {
    const conversation = await repositories.findConversation({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
    });
    if (!conversation) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.NOT_FOUND, "Conversation not found");
    }
  };

const assertCanBegin =
  ({ repositories }: TurnStateContext): TurnStore["assertCanBegin"] =>
  async (auth, conversationId) => {
    const available = await repositories.resolveConversationTurnAvailability({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
      now: new Date().toISOString(),
      recoveryGraceMs: TURN_RECOVERY_GRACE_MS,
    });
    if (!available) throw busy();
  };

const beginTurn =
  ({ repositories }: TurnStateContext): TurnStore["beginTurn"] =>
  async (input) => {
    const { auth, conversationId, userMessage } = input;
    const now = new Date().toISOString();

    await createConversation(repositories, auth, conversationId, now);
    await repositories.appendMessage({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
      messageId: userMessage.id,
      role: TURN_MESSAGE_ROLES.USER,
      parts: [{ type: "text", text: userMessage.text }],
      metadataJson: {},
      now,
    });
    const turnRecord = await startTurn(repositories, input, now);

    return {
      conversationId,
      turnId: turnRecord.assistantTurnId,
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
    };
  };

const bindRun =
  ({ repositories }: TurnStateContext): TurnStore["bindRun"] =>
  async (turn, runId) => {
    await repositories.bindTurnRun({
      workspaceId: turn.workspaceId,
      assistantTurnId: turn.turnId,
      runId,
      now: new Date().toISOString(),
    });
  };

const claimRun =
  ({ repositories }: TurnStateContext): TurnExecutionClaimStore["claimRun"] =>
  async (turn, runId) => {
    const result = await repositories.claimTurnRun({
      workspaceId: turn.workspaceId,
      subjectId: turn.subjectId,
      conversationId: turn.conversationId,
      assistantTurnId: turn.turnId,
      runId,
      now: new Date().toISOString(),
    });
    if (result.claimed) return TURN_CLAIM_DISPOSITIONS.EXECUTE;
    if (result.record.status === "open" && result.record.cancelRequestedAt !== undefined) {
      return TURN_CLAIM_DISPOSITIONS.CANCEL;
    }
    return TURN_CLAIM_DISPOSITIONS.FENCED;
  };

const assertRunOwned =
  ({ repositories }: TurnStateContext): TurnStore["assertRunOwned"] =>
  async (auth, conversationId, runId) => {
    const turn = await repositories.findAssistantTurnByRun({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      runId,
    });
    if (!turn || turn.conversationId !== conversationId) {
      throw runNotFound();
    }
  };

const requestCancellation =
  ({ repositories }: TurnStateContext): TurnCancellationStore["requestCancellation"] =>
  async (auth, conversationId, runId) => {
    try {
      const disposition = await repositories.requestTurnCancellation({
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        conversationId,
        runId,
        now: new Date().toISOString(),
      });
      return disposition === TURN_CANCELLATION_DISPOSITIONS.DELIVER
        ? CANCEL_REQUEST_DISPOSITIONS.DELIVER
        : CANCEL_REQUEST_DISPOSITIONS.ACKNOWLEDGED;
    } catch (error) {
      if (error instanceof DbRepositoryError && error.code === "record_not_found") {
        throw runNotFound();
      }
      throw error;
    }
  };

const assertRunAccessible =
  ({ repositories }: TurnStateContext): TurnRunAccess["assertAccessible"] =>
  async (auth, runId) => {
    const turn = await repositories.findAssistantTurnByRun({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      runId,
    });
    if (!turn) {
      throw runNotFound();
    }
    return { turnId: turn.assistantTurnId };
  };

const finalize =
  ({ repositories }: TurnStateContext): TurnStore["finalize"] =>
  async (turn, record) => {
    const message = record.assistantMessage;
    const result = await repositories.finalizeAssistantTurn({
      workspaceId: turn.workspaceId,
      assistantTurnId: turn.turnId,
      status: record.terminal.status,
      ...(message === undefined
        ? {}
        : {
            assistantMessage: {
              messageId: message.id,
              parts: message.parts.map(toJsonObject),
              metadataJson: message.metadata === undefined ? {} : toJsonObject(message.metadata),
            },
          }),
      finishReason: record.terminal.finishReason,
      errorCode: record.terminal.safeErrorCode,
      usage: {
        inputTokens: record.terminal.usage.inputTokens,
        outputTokens: record.terminal.usage.outputTokens,
        totalTokens: record.terminal.usage.totalTokens,
        reasoningTokens: record.terminal.usage.reasoningTokens ?? 0,
        cachedInputTokens: record.terminal.usage.cachedInputTokens ?? 0,
      },
      now: new Date().toISOString(),
    });
    return result.claimed;
  };

const createConversation = async (
  repositories: SidechatRepositories,
  auth: AuthContext,
  conversationId: string,
  now: string,
): Promise<void> => {
  try {
    await repositories.createOrGetConversation({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      actorId: auth.subjectId,
      conversationId,
      conversationKey: conversationId,
      now,
    });
  } catch (error) {
    if (uniqueViolationConstraint(error) === CONVERSATIONS_PRIMARY_KEY_CONSTRAINT) {
      throw new TurnRejectedError(
        TURN_REJECTION_CODES.FORBIDDEN,
        "Conversation belongs to a different subject",
      );
    }
    throw error;
  }
};

const startTurn = async (
  repositories: SidechatRepositories,
  input: BeginTurnInput,
  now: string,
) => {
  try {
    const started = await repositories.startAssistantTurn({
      workspaceId: input.auth.workspaceId,
      subjectId: input.auth.subjectId,
      actorId: input.auth.subjectId,
      requestId: input.requestId,
      conversationId: input.conversationId,
      userMessageId: input.userMessage.id,
      ...PENDING_PROVENANCE,
      recoveryGraceMs: TURN_RECOVERY_GRACE_MS,
      now,
    });
    return started.record;
  } catch (error) {
    if (error instanceof DbRepositoryError && error.code === "conversation_busy") {
      throw busy();
    }
    throw error;
  }
};

const busy = (): TurnRejectedError =>
  new TurnRejectedError(TURN_REJECTION_CODES.BUSY, "Conversation already has a running turn");

const runNotFound = (): TurnRejectedError =>
  new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
