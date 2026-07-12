import {
  DbRepositoryError,
  uniqueViolationConstraint,
  type SidechatRepositories,
} from "@side-chat/db";
import { toJsonObject } from "@side-chat/shared";

import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { MessageStore } from "#application/ports/turn/message-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import type { BeginTurnInput, TurnStore } from "#application/ports/turn/turn-store";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";
import { TURN_MESSAGE_ROLES } from "#domain/turn/turn";

import type { TurnStateContext } from "../types.js";

const CONVERSATIONS_PRIMARY_KEY_CONSTRAINT = "conversations_pkey";

// Provenance columns are non-null, so a running turn needs some value before
// model selection. Step 18 replaces these placeholders with real provenance.
const PENDING_PROVENANCE = {
  modelProvider: "pending",
  modelId: "pending",
  instructionsVersion: "v1",
  configVersion: "v1",
  contentFilterVersion: "v1",
} as const;

type TurnLifecycle = Pick<
  ConversationStore & MessageStore & TurnStore & TurnRunAccess,
  | "assertOwned"
  | "assertCanBegin"
  | "beginTurn"
  | "bindRun"
  | "assertRunOwned"
  | "assertAccessible"
  | "appendAssistantMessage"
  | "claimTerminal"
>;

/** Maps turn lifecycle ports to database repositories and their error contract. */
export const createPostgresTurnLifecycle = (context: TurnStateContext): TurnLifecycle => ({
  assertOwned: assertOwned(context),
  assertCanBegin: assertCanBegin(context),
  beginTurn: beginTurn(context),
  bindRun: bindRun(context),
  assertRunOwned: assertRunOwned(context),
  assertAccessible: assertRunAccessible(context),
  appendAssistantMessage: appendAssistantMessage(context),
  claimTerminal: claimTerminal(context),
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
    // This is only a fast pre-check. The unique index remains the race-safe
    // one-running-turn guard inside beginTurn.
    const active = await repositories.findActiveAssistantTurn({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
    });
    if (active) {
      throw busy();
    }
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
  };

const appendAssistantMessage =
  ({ repositories }: TurnStateContext): MessageStore["appendAssistantMessage"] =>
  async (turn, message) => {
    await repositories.appendMessage({
      workspaceId: turn.workspaceId,
      subjectId: turn.subjectId,
      conversationId: turn.conversationId,
      messageId: message.id,
      role: TURN_MESSAGE_ROLES.ASSISTANT,
      parts: message.parts.map(toJsonObject),
      metadataJson: message.metadata === undefined ? {} : toJsonObject(message.metadata),
      now: new Date().toISOString(),
    });
  };

const claimTerminal =
  ({ repositories }: TurnStateContext): TurnStore["claimTerminal"] =>
  async (turn, terminal) => {
    const result = await repositories.claimAssistantTurnTerminal({
      workspaceId: turn.workspaceId,
      assistantTurnId: turn.turnId,
      status: terminal.status,
      assistantMessageId: undefined,
      finishReason: terminal.finishReason,
      errorCode: terminal.safeErrorCode,
      usage: {
        inputTokens: terminal.usage.inputTokens,
        outputTokens: terminal.usage.outputTokens,
        totalTokens: terminal.usage.totalTokens,
        reasoningTokens: terminal.usage.reasoningTokens ?? 0,
        cachedInputTokens: terminal.usage.cachedInputTokens ?? 0,
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
