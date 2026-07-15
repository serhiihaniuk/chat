import {
  DB_REPOSITORY_ERROR_CODES,
  DbRepositoryError,
  TURN_CANCELLATION_DISPOSITIONS,
} from "@side-chat/db";
import { toJsonObject } from "@side-chat/shared";

import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import {
  CANCEL_REQUEST_DISPOSITIONS,
  BEGIN_TURN_DISPOSITIONS,
  TURN_CLAIM_DISPOSITIONS,
  type TurnCancellationStore,
  type TurnExecutionClaimStore,
  type TurnStore,
} from "#application/ports/turn/turn-store";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import { TURN_MESSAGE_ROLES } from "#domain/turn/turn";

import type { TurnStateContext } from "../types.js";

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
  async (auth, conversationId, requestId) => {
    const replay = await repositories.findAssistantTurnByRequest({
      workspaceId: auth.workspaceId,
      requestId,
    });
    if (replay) {
      if (replay.subjectId === auth.subjectId && replay.conversationId === conversationId) return;
      throw requestConflict();
    }
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
    try {
      const result = await repositories.beginAssistantTurn({
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        actorId: auth.subjectId,
        requestId: input.requestId,
        conversationId,
        conversationKey: conversationId,
        userMessageId: userMessage.id,
        userMessage: {
          messageId: userMessage.id,
          role: TURN_MESSAGE_ROLES.USER,
          parts: [{ type: "text", text: userMessage.text }],
          metadataJson: {},
        },
        ...PENDING_PROVENANCE,
        recoveryGraceMs: TURN_RECOVERY_GRACE_MS,
        now,
      });
      return {
        conversationId,
        turnId: result.turn.assistantTurnId,
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        disposition: result.inserted
          ? BEGIN_TURN_DISPOSITIONS.CREATED
          : BEGIN_TURN_DISPOSITIONS.REUSED,
        ...(result.turn.runId === undefined ? {} : { runId: result.turn.runId }),
      };
    } catch (error) {
      if (!(error instanceof DbRepositoryError)) throw error;
      if (error.code === DB_REPOSITORY_ERROR_CODES.CONVERSATION_BUSY) throw busy();
      if (error.code === DB_REPOSITORY_ERROR_CODES.IDEMPOTENCY_CONFLICT) {
        throw requestConflict();
      }
      if (error.code === DB_REPOSITORY_ERROR_CODES.CROSS_TENANT_ACCESS_DENIED) {
        throw new TurnRejectedError(
          TURN_REJECTION_CODES.FORBIDDEN,
          "Conversation belongs to a different subject",
        );
      }
      throw error;
    }
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

const busy = (): TurnRejectedError =>
  new TurnRejectedError(TURN_REJECTION_CODES.BUSY, "Conversation already has a running turn");

const requestConflict = (): TurnRejectedError =>
  new TurnRejectedError(
    TURN_REJECTION_CODES.REQUEST_CONFLICT,
    "The request id was already used for a different turn request",
  );

const runNotFound = (): TurnRejectedError =>
  new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
